# Upstream Sync Tracker — OpenWA Gateway

This fork (`mchamoudadev/OpenWA`, branch `caawiye-integration`) is a **customized fork** of an
actively-maintained upstream. This file tracks how current we are, so we don't drift 500+
commits behind again and re-hit bugs the maintainers already fixed.

---

## Current sync state

| Field | Value |
|---|---|
| **Upstream repo** | https://github.com/rmyndharis/OpenWA.git (remote `upstream`) |
| **Our fork** | https://github.com/mchamoudadev/OpenWA.git (remote `origin`) |
| **Working branch** | `caawiye-integration` |
| **Tracking** | **`upstream/main`** (the development line — NOT tagged releases, per owner's choice) |
| **Last synced to** | `upstream/main` @ `35ca31f` (= tag `v0.8.14` + 3 commits: plugin worker fail-fast #683, plugin-search docs #682, Korean i18n polish) |
| **Synced on** | 2026-07-11 |
| **⚠ Tracking-main tradeoff** | You now pull upstream's newest commits, which are **not always in a tagged release** — i.e. less battle-tested than a `vX.Y.Z` tag. Upside: every fix the moment it lands. Downside: a future sync may pull an unreleased regression. If a sync ever breaks, fall back to the newest tag (`git tag \| sort -V \| tail -1`) instead of `main`, or roll back to the backup branch. |
| **whatsapp-web.js** | 1.34.7 (pinned) |
| **Backup of pre-sync state** | branch `caawiye-integration-backup` @ `fcfd639` |

### Our custom commits (sit on TOP of the upstream base — preserve these on every sync)
```
Pin whatsapp-web.js to 1.34.7 (P3-T1 version pinning)
Allow underscores and 100-char session names
Add Caawiye platform integration module (P3-T1)   ← the inbound HMAC forwarder
Document Caawiye integration env vars in .env.example (P3-T1)
```
All Caawiye code lives under `src/modules/caawiye/**` (new files, additive). The only shared
files these commits touch are: `src/app.module.ts` (registers `CaawiyeModule`),
`src/config/configuration.ts` (the `caawiye` config block), `src/modules/session/dto/create-session.dto.ts`
(underscore/100-char session names), and `package.json` (whatsapp-web.js pin). Conflicts on a
sync will only appear in those few files.

### Runtime config (NOT in git — gitignored)
`.env` in this repo dir holds the forwarder wiring and must be preserved across syncs:
```
CAAWIYE_ENABLED=true
CAAWIYE_WEBHOOK_URL=http://localhost:3000/api/channels/wa/webhook
WA_WEBHOOK_SECRET=<same value as the platform's .env>
```

---

## Why we synced (2026-07-11): bugs we hit that upstream had already fixed

| Symptom we hit | Upstream fix pulled in |
|---|---|
| `Error: No LID for user` — bot reply never sends | #573 → PRs #578 (`resolveSendId`), #581 (self-heal + cache), #584 (reply/forward residuals), #618 (`canonicalChatId`) |
| Chrome "browser is already running" / launch crashes | #636, #254, #219 (engine-init hardening) |
| WhatsApp session reset on every gateway restart | #218 (auto-start authenticated sessions after restart) |
| Messages not reaching some numbers | #368, #199 (delivery after LID migration) |

Fork was **553 commits behind** before this sync.

LID send resolution now lives in `src/engine/adapters/whatsapp-web-js.adapter.ts`
(`resolveSendId`, `sendResolved`, `isNoLidForUser`, `lidMappingStore`).

---

## Left behind (deliberately, as of 2026-07-11)

**3 commits** on `upstream/main` past `v0.8.14` — none critical, all past the newest stable tag:
```
35ca31f  fix(plugins): fail-fast hooks/webhooks on a dead worker (#683)
018f5eb  docs: plugin search-provider author guide (#682)
5a9b5a9  fix(i18n): polish Korean locale strings
```
Take these only if we later ship the plugin worker path or need the docs; otherwise wait for the
next tagged release.

### Deferred integration enhancement (not a bug, needs coordination)
v0.8.14's inbound `IncomingMessage` now exposes the full neutral WhatsApp address
(`from`/`chatId` as `<phone>@c.us` or `<lid>@lid`, plus `isLidSender` / `senderPhone`). Forwarding
that full address in the HMAC webhook body would let the **platform** target the exact reply JID
instead of reconstructing `@c.us`. It compiles cleanly but was NOT shipped because it crosses the
gateway↔platform webhook contract — do it as a coordinated change **on both sides** (gateway
forwarder + `packages/channels/src/wa-qr/webhook.ts` + `routing.ts`) once the platform webhook
schema is confirmed to accept the extra fields. The gateway-side LID self-heal makes this
optional for now.

---

## Production landmines upstream ALREADY defused (you're now protected — watch these categories)

These are errors the maintainers hit and fixed that we would realistically face running real tenants.
We now HAVE all of them (on `main`). Listed so you know what's protecting you — and which
categories to watch for NEW fixes in on future syncs.

**Session survival & Chrome under load (the #1 QR-tier pain at scale):**
- Auto-start authenticated sessions after a gateway/container restart (no re-scan every reboot). [#218]
- No reconnect attempts fired during shutdown/drain; "reconnection failed after 0 attempts" fixed.
- A terminally-failed session no longer strands its Chrome or wedges at "already running."
- Docker Compose no longer kills Chromium mid-spawn under multi-session whatsapp-web.js load.
- Chrome-for-Testing instead of the Debian package (fixes SIGTRAP launch crashes in strict/K8s envs). [#0.8.12]
- Session delete purges its on-disk engine auth directory (no leftover locked dirs).

**Delivery reliability (silent customer-message loss):**
- Inbound ingress deliveries retry with backoff instead of failing on the first error.
- The `message:sending` moderation gate and `message:failed` notification now cover every outbound path.
- A reaction no longer clobbers a message's delivery status.
- Sibling webhooks on the same event get distinct idempotency keys (no cross-cancellation).
- Prometheus counter for terminally-failed webhook deliveries (`/api/metrics`) — observability.

**Data growth / DB at scale (disk-fill + slowdown outages):**
- `ingress_events` + `integration_delivery_failures` pruned past `INGRESS_RETENTION_DAYS` (default 90) —
  tables no longer grow unbounded until the disk fills.
- `DATABASE_SYNCHRONIZE=true` on Postgres rejected at boot (it was dropping the search column every boot).
- `DATABASE_STATEMENT_TIMEOUT_MS` / `IDLE_TIMEOUT_MS` / connection tuning; indexed `webhooks.sessionId`.

**Security (what a pentest / incident would exploit):**
- SSRF guard on all webhook + media-by-URL fetches (internal IPs, cloud metadata, IPv6 gaps, DNS-rebinding).
- API keys scoped to specific sessions; ADMIN role on audit/stats/plugins; failed-auth attempts audited.
- Secret files `0600`; secrets redacted in logs; dev API key refused in prod; Swagger off in prod.
- Oversized-payload bounds, decompression-bomb caps, path-traversal blocked on session names.

**Media:** channel/`@newsletter` media send fails clean (501) instead of crashing on the removed `avParams`;
`base64` takes precedence over a stale `url`.

> When you sync in future, skim `CHANGELOG.md` for NEW entries in these same categories —
> those are the ones that protect a production WhatsApp gateway.

---

## 🚀 PRODUCTION ENV CHECKLIST (set these BEFORE real customers)

Most upstream security/retention fixes ship in the CODE but need env config to fully activate.
Local dev defaults are fine; production is not. Go through this before exposing the gateway.
All of these go in the GATEWAY's `.env` (`/openwa-gateway/.env`) unless noted.

### 🔴 Auth & secrets (do NOT skip — local currently uses the well-known dev key)
- [ ] `NODE_ENV=production` — flips prod-safe defaults on.
- [ ] `API_MASTER_KEY=<openssl rand -hex 32>` — the gateway's admin API key. **Local currently runs the
      well-known `dev-admin-key`** (platform sends `WA_GATEWAY_API_KEY=dev-admin-key`). In prod set a strong
      `API_MASTER_KEY` here AND set the platform's `WA_GATEWAY_API_KEY` to the SAME value.
- [ ] Do **NOT** set `ALLOW_DEV_API_KEY=true` in prod (it re-enables `dev-admin-key`). Upstream refuses the
      dev key in prod anyway, but don't fight it.
- [ ] `WA_WEBHOOK_SECRET=<openssl rand -hex 32>` — the inbound HMAC secret. Must be a strong value and
      **identical** on the gateway `.env` and the platform (`dugsiiye-desk/.env`). Regenerate from the local dev value.
- [ ] `WA_SESSION_KEY=<openssl rand -hex 32>` — **session-at-rest encryption (AES-256-GCM).** Currently UNSET,
      so WhatsApp auth creds sit in plaintext on disk. Set it in prod so a stolen disk/backup can't hijack sessions.

### 🔒 Exposure / attack surface
- [ ] `ENABLE_SWAGGER=false` — hide the API schema on a public deployment.
- [ ] `WEBHOOK_SSRF_PROTECT=true` — keep on (default). Blocks webhooks from hitting internal IPs/metadata.
- [ ] `CORS_ORIGINS=https://your-dashboard-domain` — lock the dashboard/API to your origin(s), not `*`.
- [ ] `MCP_ENABLED=false` unless you actually use the MCP agent interface (removes a whole surface). If on,
      keep `MCP_READONLY=true` for observers and the `MCP_IP_RATE_LIMIT_*` defaults.

### 🗄️ Database (you're on Postgres)
- [ ] `DATABASE_TYPE=postgres` + real `DATABASE_*` creds (or `DATABASE_URL`).
- [ ] `DATABASE_SYNCHRONIZE=false` and `MAIN_DATABASE_SYNCHRONIZE=false` — **critical**: `true` on Postgres
      drops the search column every boot and breaks `/search` (upstream now rejects the combo at boot, but set it right).
- [ ] `DATABASE_SSL=true` + `DATABASE_SSL_REJECT_UNAUTHORIZED=true` for a managed Postgres (Neon/RDS).
- [ ] `DATABASE_STATEMENT_TIMEOUT_MS` / `DATABASE_IDLE_TIMEOUT_MS` — set sane caps so a slow query can't wedge a connection.

### 🧹 Retention (stops tables filling the disk over weeks)
- [ ] `AUDIT_RETENTION_DAYS=90` · `WEBHOOK_FAILURE_RETENTION_DAYS=90` · `INGRESS_RETENTION_DAYS=90`
      (defaults are 90; set explicitly so nobody later assumes "forever"). `0`/negative = keep forever = disk risk.

### 📱 Sessions / Chrome (reliability at scale)
- [ ] `AUTO_START_SESSIONS=true` — sessions resume after a restart (the fix that stops re-scanning every reboot).
- [ ] `PUPPETEER_HEADLESS=true`. On Linux/containers verify the Chrome-for-Testing path resolves (upstream's
      Dockerfile handles amd64; arm64 uses Debian chromium).
- [ ] `REDIS_ENABLED=true` + real `REDIS_HOST/PORT` (not the builtin) for durable queues across restarts.

### 🔗 Caawiye forwarder (already set locally — update the URL for prod)
- [ ] `CAAWIYE_ENABLED=true`
- [ ] `CAAWIYE_WEBHOOK_URL=https://<your-platform-domain>/api/channels/wa/webhook`  (localhost:3000 in dev)
- [ ] `WA_WEBHOOK_SECRET=` — the same strong secret as above (shared with the platform).

### Platform side (`dugsiiye-desk/.env`) — the matching prod keys
- [ ] `DATABASE_URL` (managed Postgres + pgvector, e.g. Neon), `OPENROUTER_API_KEY`, R2 storage creds,
      `WA_GATEWAY_URL` (the gateway's prod URL), `WA_GATEWAY_API_KEY` (= gateway's `API_MASTER_KEY`),
      `WA_WEBHOOK_SECRET` (= gateway's, shared). Optional: Resend (email), Langfuse (tracing).

> Generate every secret fresh for prod: `openssl rand -hex 32`. Never reuse the dev values.

---

## How to sync again next time (procedure)

```bash
cd /Users/mohamudosman/Documents/builds/openwa-gateway

# 0. Safety net + clean tree
git branch -f caawiye-integration-backup caawiye-integration
git status --short            # must be clean (commit/stash anything first)

# 1. Get the latest upstream + pick the NEWEST STABLE TAG (prefer a vX.Y.Z tag over main)
git fetch upstream --tags
git tag | grep '^v0\.' | sort -V | tail -5      # note the newest tag, e.g. v0.8.15

# 2. Replay our custom commits onto it
git rebase <newest-tag>       # e.g.  git rebase v0.8.15

#    Resolve conflicts ONLY in: app.module.ts, configuration.ts,
#    create-session.dto.ts, .env.example, package.json — keep upstream + re-add the
#    Caawiye blocks. If caawiye/** fails to compile, upstream moved an interface:
#    read the new src/core/hooks + src/engine/interfaces and adapt the imports.

# 3. Rebuild + verify (do NOT start the server if one is already on :2785)
npm install
npm run build                 # must exit 0; dist/main.js produced
npx jest caawiye              # our integration tests: routing, HMAC, vault

# 4. Update the "Current sync state" table at the top of THIS file, commit it.
```

### Rollback (if a sync breaks something)
```bash
git checkout caawiye-integration
git reset --hard caawiye-integration-backup
npm install && npm run build
```

---

## Strategic note
The QR/whatsapp-web.js channel is inherently fragile — WhatsApp changes its protocol (e.g. the LID
migration) and this fork has to chase it. **Check upstream for a newer tagged release every few
weeks**, or before any demo. For high-volume tenants, the durable answer is the official WhatsApp
Cloud API (no browser, no LID games) — see PRD §11.3 / the QR→Cloud migration path.
