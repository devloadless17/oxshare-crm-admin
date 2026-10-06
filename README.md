# OxShare CRM — admin console

Next.js 16 app of the OxShare CRM. It talks to the NestJS API (`oxshare-crm-backend`) directly from the
browser; the client portal is a separate repo.

|            |                                     |
| ---------- | ----------------------------------- |
| Production | https://admin-dashboard.oxshare.com |
| API        | https://api-admin.oxshare.com       |
| Local      | http://localhost:3002               |

## Run locally

Start the backend first (`docker compose up -d && npm run dev` in `oxshare-crm-backend`, port 3001), then:

```bash
npm ci
npm run dev        # http://localhost:3002
```

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `npm test`              | unit and component tests (Vitest)                         |
| `npm run e2e`           | end-to-end tests (Playwright) against the local stack     |
| `npm run gen:api-types` | regenerates `src/lib/api/types.gen.ts` from the local API |

## Deploying

A push to `production` deploys this app with zero downtime. See [DEPLOYMENT.md](DEPLOYMENT.md), and for
the whole production setup `INFRASTRUCTURE.md` in the backend repo. Conventions for working in this repo
are in [CLAUDE.md](CLAUDE.md).
