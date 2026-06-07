# Frontend Infrastructure

Terraform for hosting the [frontend](../README.md) signup UI on AWS (private S3
served by CloudFront), with TLS via ACM, DNS in Cloudflare, and deployment by
AWS CodeBuild. It is composed from the shared
[`terraform-modules`](https://github.com/jch254/terraform-modules) (`web-app`,
`acm-dns-validated-certificate`, `cloudflare-dns-records`, `codebuild-project`,
`codebuild-terraform-role`).

## What is managed

**Static hosting** (`web-app` module)
- Private S3 bucket (BucketOwnerEnforced, no public access) serving `dist/`
- CloudFront distribution reading the bucket via Origin Access Control (OAC)
- SPA fallback: 403/404 responses return `index.html` with HTTP 200

**TLS certificate** (`acm-dns-validated-certificate` module)
- ACM certificate for the site domain, issued in **us-east-1** (required by
  CloudFront), DNS-validated via Cloudflare records

**Cloudflare DNS** (`cloudflare-dns-records` module)
- `CNAME` from the site domain → the CloudFront distribution domain (DNS-only;
  CloudFront terminates TLS with the ACM cert), plus the ACM validation records
- Set `manage_dns = false` to skip the site record (e.g. apex managed elsewhere)

**CodeBuild deployment** (`codebuild-project` + `codebuild-terraform-role`)
- Builds the Astro site, `aws s3 sync`s `dist/` to the bucket, then invalidates
  the CloudFront distribution
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
