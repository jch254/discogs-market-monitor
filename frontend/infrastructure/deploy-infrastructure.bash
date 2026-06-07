#!/bin/bash -ex

echo Deploying frontend infrastructure via Terraform...

cd "$(dirname "$0")/terraform"

terraform init \
  -reconfigure \
  -backend-config "bucket=${REMOTE_STATE_BUCKET:-jch254-terraform-remote-state}" \
  -backend-config "key=${TF_STATE_KEY:-discogs-market-monitor-frontend-prod-infrastructure}" \
  -backend-config "region=${REMOTE_STATE_REGION:-ap-southeast-4}" \
  -get=true

terraform plan -out main.tfplan
terraform apply -auto-approve main.tfplan

echo Finished deploying frontend infrastructure
