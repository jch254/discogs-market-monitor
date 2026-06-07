# Deployment/Infrastructure

This project is built and deployed to AWS by CodeBuild. There are two components: the supporting infrastructure defined here with Terraform, and the Serverless service (Lambdas + Step Functions state machine) deployed with the Serverless Framework.

The Terraform is composed from the shared [`terraform-modules`](https://github.com/jch254/terraform-modules):

- `codebuild-project` — the CI CodeBuild project and its `master` push webhook
- `codebuild-terraform-role` — the IAM role the build assumes (Terraform + `serverless deploy`)
- `dynamodb-single-table` — the app's single DynamoDB table
- `ssm-parameter-placeholder` — the `/discogs-market-monitor/*` runtime params (created as placeholders; real values set out-of-band)

> The signup web UI is a separate static site with its own Terraform stack (CloudFront + private S3 + ACM + Cloudflare + CodeBuild). See [/frontend/infrastructure](../frontend/infrastructure) for that deployment.

I've created Docker-powered build/deployment environments for [Serverless projects](https://github.com/jch254/docker-node-serverless) and [Node projects](https://github.com/jch254/docker-node-terraform-aws) to use with AWS CodeBuild and Bitbucket Pipelines.

## Serverless Service

The build's CodeBuild role (above) carries the permissions needed for `serverless deploy`. For a local deploy, use AWS credentials with equivalent access, then from the repo root:

```bash
pnpm install
pnpm run deploy
```

See the [first-deploy bootstrap steps](../README.md#first-deploy-bootstrap) in the root README for the full ordering (infra → SSM values → serverless).

## Supporting Infrastructure/Terraform

**All commands below must be run in the /infrastructure directory.**

To deploy to AWS, you must:

1. Install [Terraform](https://www.terraform.io/) and make sure it is in your PATH.
1. Set your AWS credentials using one of the following options:
   1. Set your credentials as the environment variables `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
   1. Run `aws configure` and fill in the details it asks for.
   1. Run on an EC2 instance with an IAM Role.
   1. Run via CodeBuild or ECS Task with an IAM Role (see [buildspec-test.yml](../buildspec-test.yml) for workaround)

### Deploying infrastructure

1. Update and export all environment variables specified in the appropriate buildspec declaration (check all phases) and bash scripts
1. Initialise Terraform:

```bash
terraform init \
  -backend-config 'bucket=YOUR_S3_BUCKET' \
  -backend-config 'key=YOUR_S3_KEY' \
  -backend-config 'region=YOUR_REGION' \
  -get=true \
  -upgrade=true
```

1. `terraform plan -out main.tfplan`
1. `terraform apply main.tfplan`

### Updating infrastructure

1. Update and export all environment variables specified in the appropriate buildspec declaration (check all phases) and bash scripts
1. Make necessary infrastructure code changes.
1. Initialise Terraform:

```bash
terraform init \
  -backend-config 'bucket=YOUR_S3_BUCKET' \
  -backend-config 'key=YOUR_S3_KEY' \
  -backend-config 'region=YOUR_REGION' \
  -get=true \
  -upgrade=true
```

1. `terraform plan -out main.tfplan`
1. `terraform apply main.tfplan`

### Destroying infrastructure (use with care)

1. Update and export all environment variables specified in the appropriate buildspec declaration (check all phases) and bash scripts
1. Initialise Terraform:

```bash
terraform init \
  -backend-config 'bucket=YOUR_S3_BUCKET' \
  -backend-config 'key=YOUR_S3_KEY' \
  -backend-config 'region=YOUR_REGION' \
  -get=true \
  -upgrade=true
```

1. `terraform destroy`
