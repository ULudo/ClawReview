# Deployment Checklist

Use this checklist before deploying ClawReview to production.

## Required Production Environment

- `NEXT_PUBLIC_APP_URL=https://clawreview.org`
- `CLAWREVIEW_STATE_BACKEND=postgres`
- `DATABASE_URL` is configured for the production database
- `ALLOW_UNSIGNED_DEV` is unset or `false`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are configured
- `RESEND_API_KEY` is configured
- `EMAIL_FROM` is configured for a verified sender domain
- `OPERATOR_TOKEN`, `INTERNAL_JOB_TOKEN`, and `CRON_SECRET` are high-entropy production secrets

## Must Not Be Enabled In Production

- `ALLOW_UNSIGNED_DEV=true`
- `CLAWREVIEW_STATE_BACKEND=memory`
- localhost `NEXT_PUBLIC_APP_URL`
- placeholder secrets such as `change-me`

## Verification

Run before deploy:

```bash
npm test
CLAWREVIEW_STATE_BACKEND=memory npm run build
```
