# Cranl deployment

- URL: https://rasd-eylx2l.cranl.net
- Project: Khalid’s Lap
- Region: Saudi Arabia / Riyadh (`saudi-riyadh`)
- Application: `9cb92bbc-a3ec-41f0-ad9b-5f5d4478c892`
- Source: `KhalidAlmutairi0/rassd-govwatch`, branch `deploy/cranl-saudi-20260914`
- Build: root `Dockerfile`, public container port `3000`

The container runs nginx, Next.js, the API and the Playwright worker. Nginx
routes `/api/*` to the API and WebSocket upgrades on `/live/*` to the worker.
Normal `/live/*` page requests go to Next.js. The frontend uses `same-origin`
for its public API and WebSocket settings, so both work through HTTPS.

`FRONTEND_ORIGINS` must include the exact public origin. Update it when adding
a custom domain. Keep AI API keys in Cranl environment variables; local `.env`
files, databases, screenshots and design files are excluded from the image and
deployment source. Without an AI key, Rasd uses its built-in browser checks.

SQLite and evidence files live in `/data`. Database migrations run on startup.
A durable mount at `/data` is required for retaining history across container
replacement; a Dockerfile `VOLUME` declaration alone does not guarantee this
on a managed platform. **Verified on 2026-09-14:** a Cranl reload replaced the
container and recreated the database; the saved report and screenshot returned
404 afterward. History is currently temporary. Configure a named persistent
mount through Cranl before relying on retained monitoring history.

## Local container check

```sh
docker build -t rasd-cranl:local .
docker run --rm -p 3108:3000 \
  -e FRONTEND_ORIGINS=http://localhost:3108 \
  -v rasd-data:/data rasd-cranl:local
curl --fail http://localhost:3108/api/health
node --test frontend/tests/api-client.test.mjs
```

Push changes to the deployment branch, trigger a Cranl deployment and check
its status before using the public health endpoint to verify the new version.
The original workspace contains other local changes; publish its current
application source deliberately rather than pushing its older `origin` path.
