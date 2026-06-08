output "site_bucket" {
  description = "Name of the S3 bucket hosting the static site (CloudFront origin)."
  value       = module.site.s3_bucket_id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation after deploys)."
  value       = module.site.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain (Cloudflare CNAME target)."
  value       = module.site.cloudfront_domain_name
}

output "site_url" {
  description = "Public URL the site is served from."
  value       = "https://${local.site_domain}"
}

output "api_base_url" {
  description = "httpApi base URL baked into the build as PUBLIC_API_BASE_URL."
  value       = var.api_base_url
}

output "codebuild_project_name" {
  description = "Name of the CodeBuild project that builds and deploys the site."
  value       = module.codebuild_project.project_name
}

output "codebuild_role_arn" {
  description = "ARN of the IAM role used by the CodeBuild deploy project."
  value       = module.codebuild_role.role_arn
}
