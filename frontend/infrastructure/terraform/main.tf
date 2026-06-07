data "aws_caller_identity" "current" {}

data "cloudflare_zone" "zone" {
  filter = {
    name = var.domain
  }
}

locals {
  site_domain     = var.site_subdomain == "" ? var.domain : "${var.site_subdomain}.${var.domain}"
  dns_record_name = var.site_subdomain == "" ? var.domain : var.site_subdomain
}

# --- ACM certificate (us-east-1, required by CloudFront) -----------------------

module "certificate" {
  source = "github.com/jch254/terraform-modules//acm-dns-validated-certificate?ref=1.18.0"

  providers = {
    aws = aws.us_east_1
  }

  domain_name = local.site_domain
}

# Names the certificate covers. Kept as static config so the validation
# records' for_each keys are known at plan time (the ACM record names/values
# are only known after apply). Extend if subject_alternative_names are added.
locals {
  certificate_domains = [local.site_domain]
}

# DNS validation records for the cert, created in Cloudflare. Keyed by domain
# name (static); the ACM-computed record name/type/value are looked up per key.
module "certificate_validation_records" {
  source = "github.com/jch254/terraform-modules//cloudflare-dns-records?ref=1.18.0"

  zone_id = data.cloudflare_zone.zone.id
  records = {
    for domain in local.certificate_domains : domain => {
      name = one([
        for dvo in module.certificate.domain_validation_options :
        dvo.resource_record_name if dvo.domain_name == domain
      ])
      type = one([
        for dvo in module.certificate.domain_validation_options :
        dvo.resource_record_type if dvo.domain_name == domain
      ])
      content = one([
        for dvo in module.certificate.domain_validation_options :
        dvo.resource_record_value if dvo.domain_name == domain
      ])
      ttl = 1
    }
  }
}

resource "aws_acm_certificate_validation" "site" {
  provider = aws.us_east_1

  certificate_arn         = module.certificate.arn
  validation_record_fqdns = [for record in module.certificate_validation_records.records : record.name]
}

# --- Static hosting: CloudFront + private S3 (OAC) ----------------------------

module "site" {
  source = "github.com/jch254/terraform-modules//web-app?ref=1.18.0"

  bucket_name = var.bucket_name
  dns_names   = [local.site_domain]
  acm_arn     = aws_acm_certificate_validation.site.certificate_arn
}

# --- Cloudflare DNS: CNAME the site to the CloudFront distribution ------------

module "site_dns" {
  count  = var.manage_dns ? 1 : 0
  source = "github.com/jch254/terraform-modules//cloudflare-dns-records?ref=1.18.0"

  zone_id = data.cloudflare_zone.zone.id
  records = {
    site = {
      name = local.dns_record_name
      type = "CNAME"
      # CloudFront serves TLS via the ACM cert, so Cloudflare is DNS-only here.
      content = module.site.cloudfront_domain_name
      proxied = false
    }
  }
}

# --- CodeBuild: build the Astro site, sync dist/ to S3, invalidate CloudFront --

module "codebuild_role" {
  source = "github.com/jch254/terraform-modules//codebuild-terraform-role?ref=1.18.0"

  name        = var.codebuild_project_name
  environment = var.environment

  enable_acm             = true
  codebuild_project_arns = ["*"]

  # Read the Cloudflare API token used by the Terraform cloudflare provider.
  ssm_parameter_arns = [
    "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.cloudflare_api_token_parameter_name}",
  ]

  # The build manages its own IAM role (named with the project prefix).
  prefix_managed_services = ["iam_role"]

  additional_policy_statements = [
    # Terraform manages the bucket + CloudFront distribution; the build syncs
    # objects to S3 and creates a CloudFront invalidation after each deploy.
    {
      Effect   = "Allow"
      Action   = ["s3:*"]
      Resource = ["*"]
    },
    {
      Effect   = "Allow"
      Action   = ["cloudfront:*"]
      Resource = ["*"]
    },
    {
      Effect   = "Allow"
      Action   = ["logs:*"]
      Resource = ["*"]
    },
  ]
}

module "codebuild_project" {
  source = "github.com/jch254/terraform-modules//codebuild-project?ref=1.18.0"

  name               = var.codebuild_project_name
  description        = "Build and deploy the Discogs Market Monitor frontend to S3/CloudFront"
  codebuild_role_arn = module.codebuild_role.role_arn
  build_docker_image = var.codebuild_build_docker_image
  build_docker_tag   = var.codebuild_build_docker_tag
  build_compute_type = var.codebuild_build_compute_type
  source_type        = "GITHUB"
  source_location    = var.codebuild_source_location
  buildspec          = var.codebuild_buildspec
  git_clone_depth    = 1

  environment_variables = [
    { name = "AWS_DEFAULT_REGION", value = var.aws_region },
    { name = "PUBLIC_API_BASE_URL", value = var.api_base_url },
    { name = "SITE_URL", value = "https://${local.site_domain}" },
  ]

  webhook_enabled = var.codebuild_webhook_enabled
  webhook_filter_groups = [[
    { type = "EVENT", pattern = "PUSH" },
    { type = "HEAD_REF", pattern = "refs/heads/${var.codebuild_webhook_branch}" },
  ]]
}
