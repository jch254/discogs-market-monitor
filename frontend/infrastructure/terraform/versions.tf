terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # Backend bucket/key/region are supplied via -backend-config in
  # deploy-infrastructure.bash so this root stays environment-agnostic.
  backend "s3" {
    encrypt = true
  }
}
