# Changelog

Notable changes to MCP Gateway Console. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Saturn MCP Console is now MCP Gateway Console, by Eisoptric.** The repository moved to [eisoptric/MCP-gateway-frontend](https://github.com/eisoptric/MCP-gateway-frontend), the console is at `dashboard.eisoptric.com`, and the API is proxied under `/gateway-api` (was `/saturn-api`).
- The console's tab, home-screen and README icons are the Eisoptric Speculum mark.
- **Breaking: earlier sign-ins and member keys do not carry over.** The password and member-key derivations now use `eisoptric-*` labels, so a password set before this version no longer signs in and a member key wrapped before it no longer opens. It needs the matching backend version.

### Added

- Settings has an **Approved MCP hosts** section. Admins approve the hosts where custom MCP servers may run, after confirming it is them. When a connection is refused because its host is not approved, the marketplace links there. This needs the matching backend change.

- Cloudflare (`mcp.cloudflare.com`), Cloud Run (`run.googleapis.com`), Memorystore for Redis (`redis.googleapis.com`), Cloud SQL for PostgreSQL (`sqladmin.googleapis.com`), alphaXiv for arXiv papers (`api.alphaxiv.org`) and Weights & Biases (`mcp.withwandb.com`) in the marketplace. They need the backend change that approves these hosts.

### Fixed

- The Slack card now uses Slack's fixed endpoint, `https://mcp.slack.com/mcp`, and says to paste a token from an internal Slack app, since Slack does not let other apps sign in. The Shopify card says to approve the store's domain in Settings first.
- Typing in a field on a phone no longer zooms the page. iOS Safari zooms into any field with text under 16px; the rule that set 16px on phones was in the base layer, where the `text-[13px]` on each field overrode it.

### Changed

- The Gmail card says it can also organize mail (labels, trash, spam) and cannot delete mail permanently, to match the backend's switch to `gmail.modify`.
- The Google Calendar card says it can create, update and delete events and answer invitations, to match the backend's switch to `calendar.events`.
- The tool sets note says what the backend now does: a policy rule for the tool decides first, and with none, the tool runs or waits for approval as set in the tool set.
- A tool checked into a tool set, one by one or with **Select shown**, now starts at **Require approval**. Switch it to **Allow** on purpose.
- The console's outside uptime check moved from a scheduled GitHub workflow to a Cloud Monitoring check set up from the backend repository. On the Cloudflare free plan, Bot Fight Mode answered every run from GitHub with a 403 while the console was up.

## [0.1.0] - 2026-11-16

This is the first tagged release, and it ends the first phase of development. The gaps that are known and not yet fixed are listed under [Known limitations](README.md#known-limitations) in the README.

### What it includes

- **Console.**
  - Connect MCP servers.
  - Assign tool sets to agents.
  - Build policies.
  - Approve held calls.
  - Read the audit record and the activity history.
- **Sign-in.**
  - The password never leaves the browser: Argon2id and HKDF split it into a login verifier and a wrap key.
  - The session is an HttpOnly cookie.
  - Passkeys, authenticator codes and emailed codes, and step-up for sensitive changes.
- **Payload encryption.**
  - The organization's ML-KEM-1024 key pair is generated in the browser.
  - Member keys are wrapped with the password-derived key.
  - An admin approves each member's new key after checking its fingerprint.
  - Audit content is decrypted only in the browser.
- **Hardening.**
  - A per-request CSP nonce.
  - An origin check in front of Cloud Run.
  - `security.txt`.
- **Operations.**
  - A public status page and `/health`.
  - A scheduled uptime check.
  - Deploys wait for the checks and for approval in the `production` environment.
- **Languages.** English and Traditional Chinese.
- **License.** Apache 2.0. Earlier commits were licensed under FSL-1.1-ALv2.

### Pull requests

- [#15](https://github.com/eisoptric/MCP-gateway-frontend/pull/15) Email step-up code, keep the new address on email change
- [#14](https://github.com/eisoptric/MCP-gateway-frontend/pull/14) Sign-in result, activity paging, step-up codes, and the policy builder split
- [#13](https://github.com/eisoptric/MCP-gateway-frontend/pull/13) Fix what the final review found in the console, and check uptime for free
- [#12](https://github.com/eisoptric/MCP-gateway-frontend/pull/12) Public status page, a /health route, and the review follow-ups
- [#11](https://github.com/eisoptric/MCP-gateway-frontend/pull/11) README: point repository links at the renamed MCP-Gateway repositories
- [#10](https://github.com/eisoptric/MCP-gateway-frontend/pull/10) Close the API proxy bypass, show members their key fingerprint, and keep keys across password and email changes
- [#9](https://github.com/eisoptric/MCP-gateway-frontend/pull/9) Offer a passkey or an authenticator for admin MFA setup
- [#8](https://github.com/eisoptric/MCP-gateway-frontend/pull/8) Fix findings from the 2026-11-08 security review
- [#7](https://github.com/eisoptric/MCP-gateway-frontend/pull/7) Tech debt: check the member key fingerprint before helping
- [#6](https://github.com/eisoptric/MCP-gateway-frontend/pull/6) Publish security.txt and a disclosure anchor
- [#5](https://github.com/eisoptric/MCP-gateway-frontend/pull/5) Require TOTP for organization admins
- [#4](https://github.com/eisoptric/MCP-gateway-frontend/pull/4) Show reconnect on connections that cannot be opened
- [#3](https://github.com/eisoptric/MCP-gateway-frontend/pull/3) Block direct Cloud Run access
- [#2](https://github.com/eisoptric/MCP-gateway-frontend/pull/2) Block deploy until the typecheck passes
- [#1](https://github.com/eisoptric/MCP-gateway-frontend/pull/1) Split sign-in into a verifier and a member wrap key

[0.1.0]: https://github.com/eisoptric/MCP-gateway-frontend/releases/tag/v0.1.0
