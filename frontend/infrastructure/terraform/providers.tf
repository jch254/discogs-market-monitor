provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "discogs-market-monitor-frontend"
    }
  }
}

# Authenticates from the CLOUDFLARE_API_TOKEN env var (loaded from SSM by
# buildspec.yml in CodeBuild, or exported locally for a bootstrap apply).
provider "cloudflare" {}
