data "aws_caller_identity" "current" {}

locals {
  site_domain     = var.site_subdomain == "" ? var.domain : "${var.site_subdomain}.${var.domain}"
  dns_record_name = var.site_subdomain == "" ? var.domain : var.site_subdomain

  remote_state_object_arn = "arn:aws:s3:::${var.remote_state_bucket}/${var.remote_state_key}"
  codebuild_project_arn   = "arn:aws:codebuild:${var.aws_region}:${data.aws_caller_identity.current.account_id}:project/${var.codebuild_project_name}"
}

# --- S3 static website hosting -------------------------------------------------

resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# The site is public, so the public-access block must allow a public bucket
# policy. Cloudflare proxies the website endpoint and provides TLS.
resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = false
  ignore_public_acls      = true
  restrict_public_buckets = false
}

resource "aws_s3_bucket_website_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  # Single-page site: serve index.html for unknown paths too.
  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id

  depends_on = [aws_s3_bucket_public_access_block.site]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
      },
    ]
  })
}

# --- Cloudflare DNS (proxied → provides TLS/CDN in front of the S3 endpoint) ---

data "cloudflare_zone" "zone" {
  count = var.manage_dns ? 1 : 0

  filter = {
    name = var.domain
  }
}

resource "cloudflare_dns_record" "site" {
  count = var.manage_dns ? 1 : 0

  zone_id = data.cloudflare_zone.zone[0].id
  name    = local.dns_record_name
  type    = "CNAME"
  content = aws_s3_bucket_website_configuration.site.website_endpoint
  proxied = true
  ttl     = 1
}

# --- CodeBuild: build the Astro site and sync dist/ to S3 ----------------------

resource "aws_iam_role" "codebuild_deploy" {
  name = "${var.codebuild_project_name}-codebuild"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "codebuild_deploy" {
  name = "${var.codebuild_project_name}-deploy"
  role = aws_iam_role.codebuild_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/${var.codebuild_project_name}*"
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameters", "ssm:GetParameter"]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.cloudflare_api_token_parameter_name}"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetBucketLocation",
          "s3:ListBucket",
        ]
        Resource = "arn:aws:s3:::${var.remote_state_bucket}"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = local.remote_state_object_arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket", "s3:GetBucketLocation"]
        Resource = aws_s3_bucket.site.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "${aws_s3_bucket.site.arn}/*"
      },
    ]
  })
}

resource "aws_codebuild_project" "deploy" {
  name         = var.codebuild_project_name
  description  = "Build and deploy the Discogs Market Monitor frontend to S3"
  service_role = aws_iam_role.codebuild_deploy.arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type    = var.codebuild_build_compute_type
    image           = "${var.codebuild_build_docker_image}:${var.codebuild_build_docker_tag}"
    type            = "LINUX_CONTAINER"
    privileged_mode = false

    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "SITE_BUCKET"
      value = aws_s3_bucket.site.id
    }
    environment_variable {
      name  = "PUBLIC_API_BASE_URL"
      value = var.api_base_url
    }
    environment_variable {
      name  = "SITE_URL"
      value = "https://${local.site_domain}"
    }
  }

  source {
    type            = "GITHUB"
    location        = var.codebuild_source_location
    buildspec       = var.codebuild_buildspec
    git_clone_depth = 1
  }

  logs_config {
    cloudwatch_logs {
      status = "ENABLED"
    }
  }
}

resource "aws_codebuild_webhook" "deploy" {
  count = var.codebuild_webhook_enabled ? 1 : 0

  project_name = aws_codebuild_project.deploy.name

  filter_group {
    filter {
      type    = "EVENT"
      pattern = "PUSH"
    }
    filter {
      type    = "HEAD_REF"
      pattern = "refs/heads/${var.codebuild_webhook_branch}"
    }
  }
}
