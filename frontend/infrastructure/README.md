# Frontend Infrastructure

Terraform for hosting the [frontend](../README.md) signup UI on AWS S3, fronted
by Cloudflare for TLS/CDN, and deployed by AWS CodeBuild.

## What is managed

**S3 static website** (`aws_s3_bucket` + `aws_s3_bucket_website_configuration`)
- Public-read bucket serving `dist/` as a static website
- `index.html` is used as both the index and error document (single-page site)

**Cloudflare DNS** (`cloudflare_dns_record`)
- Proxied `CNAME` from the site domain → the S3 website endpoint
- Cloudflare terminates TLS and caches in front of the HTTP-only S3 endpoint
- Set `manage_dns = false` to skip DNS management (e.g. apex already managed
  elsewhere)

**CodeBuild deployment** (`aws_codebuild_project`)
- Builds the Astro site and `aws s3 sync`s `dist/` to the bucket
- `PUBLIC_API_BASE_URL` is passed to the build via the project environment so
  the bundle targets the deployed API
- `CLOUDFLARE_API_TOKEN` is read from SSM Parameter Store by `buildspec.yml`

## State

Remote state is stored in S3. The bucket/key/region are supplied via
`-backend-config` in `deploy-infrastructure.bash`:

- bucket: `jch254-terraform-remote-state` (override with `REMOTE_STATE_BUCKET`)
- key: `discogs-market-monitor-frontend-prod-infrastructure` (override with `TF_STATE_KEY`)
- region: `ap-southeast-2` (override with `AWS_DEFAULT_REGION`)

## Variables worth setting

| Variable | Default | Description |
|---|---|---|
| `domain` | `603.nz` | Cloudflare zone the site is served from |
| `site_subdomain` | `""` (apex) | Subdomain to serve from, e.g. `app` |
| `bucket_name` | `discogs-market-monitor-frontend` | Globally-unique S3 bucket name |
| `api_base_url` | `""` | Deployed `httpApi` base URL baked into the build |
| `manage_dns` | `true` | Whether Terraform manages the Cloudflare DNS record |

## Local usage

```bash
cd infrastructure/terraform

# Authenticate with AWS (requires access to the S3 state bucket).
aws sso login  # or export AWS_* env vars

# For the first local/bootstrap apply, export a real Cloudflare token directly.
export CLOUDFLARE_API_TOKEN="..."

terraform init \
  -backend-config "bucket=jch254-terraform-remote-state" \
  -backend-config "key=discogs-market-monitor-frontend-prod-infrastructure" \
  -backend-config "region=ap-southeast-2"

terraform plan -var "api_base_url=https://<your-api-host>"
terraform apply -var "api_base_url=https://<your-api-host>"
```

Or run the wrapper used by CodeBuild:

```bash
bash ./deploy-infrastructure.bash
```

After the bootstrap apply, CodeBuild reads `CLOUDFLARE_API_TOKEN` from SSM
through `frontend/buildspec.yml`. Store the token once:

```bash
aws ssm put-parameter \
  --region ap-southeast-2 \
  --name /discogs-market-monitor-frontend/cloudflare-api-token \
  --type SecureString \
  --value "$CLOUDFLARE_API_TOKEN" \
  --overwrite
```

If `codebuild_webhook_enabled` is `true`, the AWS account must already have
CodeBuild GitHub source credentials configured so AWS can create the webhook.

The Cloudflare token needs Zone DNS Edit permission for the zone.
