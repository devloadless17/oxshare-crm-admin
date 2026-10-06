# Deploying the admin console

> The whole production setup on one page: `INFRASTRUCTURE.md` in the backend repo.

A push to `production` runs `.github/workflows/ci.yml`: **verify → build → deploy**, and
deploys THIS app only. The portal lives on the same server and is never touched by this
repo's deploy.

|            |                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| Server     | Hostinger KVM 2, **Paris**, `31.97.52.63` (`ssh oxshare-web`), Ubuntu 26.04                                                |
| On it      | `~/oxshare-web/`: one compose project for both frontends behind one Caddy (`deploy/`, a twin of the other frontend repo's) |
| Image      | `<DOCKER_USERNAME>/oxshare-crm-admin`, tagged `:latest` + `:<git sha>`, **private** on Docker Hub                          |
| Containers | `admin_blue` / `admin_green` (one live), never published: only Caddy listens on 80/443                                     |

## GitHub secrets

Settings → Secrets and variables → Actions. Checked on the runner before anything ships.

| Secret            | What                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DOCKER_USERNAME` | Docker Hub username                                                                                                                                           |
| `DOCKER_SECRET`   | Docker Hub access token (Read & Write)                                                                                                                        |
| `VPS_HOST`        | `31.97.52.63`                                                                                                                                                 |
| `VPS_USER`        | `deploy`                                                                                                                                                      |
| `VPS_SSH_KEY_B64` | `base64 -w0 ~/.ssh/oxshare_deploy \| clip.exe`: the deploy key, one line                                                                                      |
| `VPS_PORT`        | Optional, default 22                                                                                                                                          |
| `ADMIN_DOMAIN`    | Bare hostname of the admin console, e.g. `admin-dashboard.oxshare.com`                                                                                        |
| `PORTAL_DOMAIN`   | Bare hostname of the client portal, e.g. `portal.oxshare.com`                                                                                                 |
| `ACME_EMAIL`      | Where Let's Encrypt sends certificate notices                                                                                                                 |
| `API_ORIGIN`      | The API's origin, `https://` and no trailing slash, e.g. `https://api-admin.oxshare.com`. **Baked into the image** (bundle and CSP): a change needs a rebuild |

Both domains set the SAME values in both frontend repos: each deploy writes the domains into
the server's `.env`.

Before the first deploy, create `<DOCKER_USERNAME>/oxshare-crm-admin` on Docker Hub as **private**: the
build refuses a public or missing repository.

## What a deploy does (zero downtime)

1. Builds the image with `API_ORIGIN` baked in, and pushes both tags.
2. Copies `deploy/docker-compose.yml`, `deploy/Caddyfile` and `deploy/release.sh` to `~/oxshare-web/`.
3. Writes the domains into the server's `.env` (one line each).
4. `bash release.sh deploy admin <image>`: the new version starts in the idle colour
   (`admin_blue` / `admin_green`) BESIDE the live one, must pass its health check, Caddy is
   switched with a graceful reload, and only then the old one is stopped (20 s to drain). A
   version that never becomes healthy is stopped and the live one carries on. The other app is
   never touched.

Rehearsed on the real server (6 Oct 2026), under continuous traffic: a release served 531/531
requests (69/69 slow ones, 24 in flight at the switch), the other app 316/316 untouched; a
release failing its health check 1230/1230, all from the live version.

## Rollback

```bash
ssh oxshare-web
cd oxshare-web && bash release.sh rollback admin     # the same zero-downtime switch back
bash release.sh status                               # which colour is live, and each image
```

The previous version's image is kept on the server for exactly this.

## Verifying a release

```bash
curl -sI https://<ADMIN_DOMAIN>/favicon.ico | head -1     # HTTP/2 200
```

Then, in a browser on the deployed site: **log in → hard refresh → a write**
(DEPLOY-PLAYBOOK §9d). Login alone proves nothing; the refresh makes the app rebuild its
session from the cookies, which is exactly what differs between hosts.

## The server

Built by `deploy/provision-server.sh` in the backend repo with `ROLE=web`; its DEPLOYMENT.md
says how to replace it, and what changes when the buyer's domain arrives.

## Things that will bite if changed casually

- **The admin, the portal and the API must share ONE registrable domain** (backend
  DEPLOYMENT.md, "Where the frontends must live"): sessions are `__Host-` cookies with
  `SameSite=Lax`.
- **Never publish an app port.** Docker bypasses UFW, so a published port is open to the
  internet whatever the firewall says. Only Caddy publishes.
- **The `caddy_data` volume holds the certificates.** Deleting it forces re-issuance, which
  Let's Encrypt rate-limits per week.
- **`deploy/` is a twin.** Change it in both frontend repos together.
