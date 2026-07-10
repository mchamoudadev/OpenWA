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
| **Last synced to** | **tag `v0.8.14`** (commit `3229061`, released 2026-07-10) |
| **Synced on** | 2026-07-11 |
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
