provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "discogs-market-monitor-frontend"
    }
  }
}

# CloudFront requires its ACM certificate in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

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
