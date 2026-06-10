terraform {
  backend "s3" {
    encrypt = "true"
  }
}

provider "aws" {
  region = var.region
}

data "aws_caller_identity" "current" {}

locals {
  # shared-platform deploys one build-notifier core (SNS topic + formatter
  # Lambda) per CI region, because EventBridge can only invoke a same-region
  # Lambda. This project's CodeBuild runs in var.region (ap-southeast-2), so
  # subscribe to the formatter shared-platform deploys there.
  build_notifier_lambda_function_arn = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:${var.build_notifier_lambda_function_name}"
}

# CodeBuild role for the CI build that runs both Terraform (this root) and
# `serverless deploy` (CloudFormation creating Lambda, Step Functions, API
# Gateway, EventBridge). The module models the least-privilege Terraform-managed
# resources by name prefix; the broad serverless/CloudFormation surface that
# resists per-ARN scoping (CloudFormation, Step Functions, the serverless
# deployment bucket, KMS decrypt of SecureString params) is added explicitly.
module "codebuild_role" {
  source = "github.com/jch254/terraform-modules//codebuild-terraform-role?ref=1.18.0"

  name = var.name

  enable_api_gateway     = true
  codebuild_project_arns = ["*"]
  ssm_parameter_arns     = var.ssm_parameter_arns

  # IAM roles, Lambdas, EventBridge rules and the DynamoDB table are all named
  # with the project prefix by Terraform and serverless.
  prefix_managed_services = [
    "iam_role",
    "lambda_function",
    "event_rule",
    "dynamodb_table",
  ]

  # The build-notifications subscription adds an EventBridge invoke permission
  # on the shared formatter Lambda, which isn't covered by the prefix grants.
  lambda_permission_function_arns = [local.build_notifier_lambda_function_arn]

  additional_policy_statements = [
    # serverless deploy is CloudFormation-driven and manages its own deployment
    # bucket, so it needs broad CloudFormation and S3 (incl. bucket creation).
    {
      Effect   = "Allow"
      Action   = ["cloudformation:*"]
      Resource = ["*"]
    },
    {
      Effect   = "Allow"
      Action   = ["s3:*"]
      Resource = ["*"]
    },
    {
      Effect   = "Allow"
      Action   = ["logs:*"]
      Resource = ["*"]
    },
    # serverless-step-functions provisions the state machine.
    {
      Effect   = "Allow"
      Action   = ["states:*"]
      Resource = ["*"]
    },
    # Serverless Framework v4 records its managed deployment bucket name in SSM.
    {
      Effect = "Allow"
      Action = [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:PutParameter",
        "ssm:DeleteParameter",
      ]
      Resource = ["arn:aws:ssm:*:*:parameter/serverless-framework/*"]
    },
    # Full Lambda management over this project's functions. The module's scoped
    # grant omits version/alias actions (e.g. lambda:PublishVersion) that a
    # serverless deploy performs, so allow the whole namespace on our functions.
    {
      Effect   = "Allow"
      Action   = ["lambda:*"]
      Resource = ["arn:aws:lambda:*:*:function:${var.name}-*"]
    },
  ]
}

module "codebuild_project" {
  source = "github.com/jch254/terraform-modules//codebuild-project?ref=1.18.0"

  name               = var.name
  codebuild_role_arn = module.codebuild_role.role_arn
  build_docker_image = var.build_docker_image
  build_docker_tag   = var.build_docker_tag
  source_type        = var.source_type
  buildspec          = var.buildspec
  source_location    = var.source_location
  cache_bucket       = var.cache_bucket
  build_compute_type = var.build_compute_type

  webhook_enabled = true
  webhook_filter_groups = [[
    { type = "EVENT", pattern = "PUSH" },
    { type = "HEAD_REF", pattern = "refs/heads/master" },
  ]]

  # Email build success/failure notifications via the shared-platform notifier.
  build_notifier_lambda_function_arn = local.build_notifier_lambda_function_arn
  build_notifier_app_url             = "https://discogs.603.nz"
  build_notifier_github_repo_url     = trimsuffix(var.source_location, ".git")
}

# Single physical DynamoDB table for app state (single-table design).
# Holds ReleaseCheckState rows now (PK = USER#<userId>, SK = RELEASE#<releaseId>)
# and other entities later under distinct key prefixes. TTL on the `ttl`
# attribute lets stale rows self-expire. Consumed by the Lambda via the
# DYNAMODB_TABLE env var set in serverless.yml.
module "dynamodb_single_table" {
  source = "github.com/jch254/terraform-modules//dynamodb-single-table?ref=1.18.0"

  name = "${var.name}-entities"
}

# Runtime config/secrets read by serverless.yml (${ssm:/discogs-market-monitor/*})
# and the scheduled default monitor. Created as placeholders so the params always
# exist for the app/IAM policy; real values are set out-of-band (console/CLI) and
# preserved across applies via the module's ignore_changes = [value].
locals {
  ssm_parameters = {
    discogs_user_token = { type = "SecureString" }
    resend_api_key     = { type = "SecureString" }
    sender_email       = { type = "String" }
    username           = { type = "String" }
    ships_from         = { type = "String" }
    destination_email  = { type = "String" }
  }
}

module "ssm_parameters" {
  source   = "github.com/jch254/terraform-modules//ssm-parameter-placeholder?ref=1.18.0"
  for_each = local.ssm_parameters

  name = "/${var.name}/${each.key}"
  type = each.value.type
}
