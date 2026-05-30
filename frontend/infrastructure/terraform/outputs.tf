output "site_bucket" {
  description = "Name of the S3 bucket hosting the static site."
  value       = aws_s3_bucket.site.id
}

output "site_website_endpoint" {
  description = "S3 static website endpoint (origin behind Cloudflare)."
  value       = aws_s3_bucket_website_configuration.site.website_endpoint
}

output "site_url" {
  description = "Public URL the site is served from."
  value       = "https://${local.site_domain}"
}

output "codebuild_project_name" {
  description = "Name of the CodeBuild project that builds and deploys the site."
  value       = aws_codebuild_project.deploy.name
}

output "codebuild_role_arn" {
  description = "ARN of the IAM role used by the CodeBuild deploy project."
  value       = aws_iam_role.codebuild_deploy.arn
}
