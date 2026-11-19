# Changelog

Notable changes to Saturn MCP Console. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Cloudflare (`mcp.cloudflare.com`), Cloud Run (`run.googleapis.com`), Memorystore for Redis (`redis.googleapis.com`) and Cloud SQL for PostgreSQL (`sqladmin.googleapis.com`) in the marketplace. They need the backend change that approves these hosts.

### Changed

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

- [#15](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/15) Email step-up code, keep the new address on email change
- [#14](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/14) Sign-in result, activity paging, step-up codes, and the policy builder split
- [#13](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/13) Fix what the final review found in the console, and check uptime for free
- [#12](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/12) Public status page, a /health route, and the review follow-ups
- [#11](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/11) README: point repository links at the renamed Saturn-MCP repositories
- [#10](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/10) Close the API proxy bypass, show members their key fingerprint, and keep keys across password and email changes
- [#9](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/9) Offer a passkey or an authenticator for admin MFA setup
- [#8](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/8) Fix findings from the 2026-11-08 security review
- [#7](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/7) Tech debt: check the member key fingerprint before helping
- [#6](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/6) Publish security.txt and a disclosure anchor
- [#5](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/5) Require TOTP for organization admins
- [#4](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/4) Show reconnect on connections that cannot be opened
- [#3](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/3) Block direct Cloud Run access
- [#2](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/2) Block deploy until the typecheck passes
- [#1](https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/pull/1) Split sign-in into a verifier and a member wrap key

[0.1.0]: https://github.com/Saturn-Technology-Project/Saturn-MCP-Frontend/releases/tag/v0.1.0
