variable "aws_region" {
  description = "AWS region for the S3 site bucket and CodeBuild deploy project."
  type        = string
  default     = "ap-southeast-2"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "prod"
}

variable "domain" {
  description = "Cloudflare zone name (apex domain) the site is served from."
  type        = string
  default     = "603.nz"
}

variable "site_subdomain" {
  description = "Subdomain to serve the site from. Empty string serves at the apex."
  type        = string
  default     = ""
}

variable "bucket_name" {
  description = "Name of the S3 bucket that hosts the static site. Must be globally unique."
  type        = string
  default     = "discogs-market-monitor-frontend"
}

variable "api_base_url" {
  description = "Base URL of the deployed Serverless httpApi, baked into the build as PUBLIC_API_BASE_URL."
  type        = string
  default     = ""
}

variable "remote_state_bucket" {
  description = "S3 bucket used for Terraform remote state."
  type        = string
  default     = "jch254-terraform-remote-state"
}

variable "remote_state_key" {
  description = "S3 key used for this stack's Terraform remote state."
  type        = string
  default     = "discogs-market-monitor-frontend-prod-infrastructure"
}

variable "cloudflare_api_token_parameter_name" {
  description = "SSM Parameter Store name containing the Cloudflare API token."
  type        = string
  default     = "/discogs-market-monitor-frontend/cloudflare-api-token"
}

variable "manage_dns" {
  description = "Whether Terraform manages the Cloudflare DNS record for the site."
  type        = bool
  default     = true
}

variable "codebuild_project_name" {
  description = "Name of the CodeBuild project that builds and deploys the site to S3."
  type        = string
  default     = "discogs-market-monitor-frontend"
}

variable "codebuild_source_location" {
  description = "GitHub repository URL used by the CodeBuild source."
  type        = string
  default     = "https://github.com/jch254/discogs-market-monitor.git"
}

variable "codebuild_buildspec" {
  description = "Path to the CodeBuild buildspec file (relative to repo root)."
  type        = string
  default     = "frontend/buildspec.yml"
}

variable "codebuild_build_compute_type" {
  description = "CodeBuild compute type."
  type        = string
  default     = "BUILD_GENERAL1_SMALL"
}

variable "codebuild_build_docker_image" {
  description = "Docker image used as the CodeBuild build environment."
  type        = string
  default     = "jch254/docker-node-terraform-aws"
}

variable "codebuild_build_docker_tag" {
  description = "Docker image tag used as the CodeBuild build environment."
  type        = string
  default     = "22.x-docker"
}

variable "codebuild_webhook_enabled" {
  description = "Whether CodeBuild deploys automatically on pushes to the source branch."
  type        = bool
  default     = true
}

variable "codebuild_webhook_branch" {
  description = "Git branch that triggers CodeBuild webhook builds."
  type        = string
  default     = "master"
}
