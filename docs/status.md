# Status: where the work stands

The living snapshot of what is released, what waits on `staging` and what is planned. Any agent (Claude Code, Codex or another) reads it before starting and updates it in the same PR that changes the picture: a release, a migration applied somewhere, a plan approved or dropped. Keep it short; the detail lives in `CHANGELOG.md`, the dated plans in `docs/` and the PRs.

Last updated: 2026-11-27 (1.55.0 prepared: PWA and Web Push).

## Versions and migrations

| Installation | Version | Migrations applied |
|---|---|---|
| Production (`main`) | 1.54.0 (2026-11-26) | up to `0057` |
| Public demo (`main`) | 1.54.0 | up to `0056` (`0057` before the 1.55.0 merge, from the Console) |
| Example brand installation | 1.52.1 | up to `0056` (migrates on build) |
| Staging (`staging`) | 1.55.0 prepared | up to `0057` (Neon branch `staging`) |

FlyLabs Kit 0.25, profile `white-label` (`flylabs-kit.json`): modules auth, changelog, console, email, firma, guida, i18n, ics, migrazioni, pagamenti, pwa, shell, sicurezza, tema, ui and web-push adopted.

## Waiting on `staging` for the next release

- PWA standard (spec v1.2), WGR-06: sign-in returns to the page asked for. `proxy.ts` redirects a GET of a page without a session to `/login?next=<path+query>` and passes the asked path to the page in `x-wegrocery-path` for an expired session (`requireUserSession`); `safeCallbackPath` is replaced by `safeInternalPath`/`nextAfterLogin` (`lib/auth/hosts.ts`, Stellar's `safeNext` rules, refuses control characters such as `"/\t/evil.example"`). No migration or configuration change.
- Version 1.55.0 (prepared): PWA and Web Push W1 to W7 below plus WGR-06 above. Migration `0057` (applied on staging and production, demo before the merge). Push delivery stays `simulated` everywhere until the pilot (`PUSH_PILOT_MEMBER_IDS`, only in Production).

## In 1.55.0

- W7 adopts Kit 0.25 with PWA 1.1 and Web Push 0.1. The worker URL, scope, offline cache, push payload and queue contracts carry forward. See [PWA and push CI coverage](./pwa-ci-matrix.md).

- W6 provides the Web Push transport, VAPID diagnostics and anonymous daily counters. W5 connects the delivery queue.
- W5 (WGR-03/04/05/08) books push jobs for draft reminders (holder's consenting devices only), sends them after the reminder run and retries them hourly from `/api/cron/push-deliveries` (`17 * * * *`, Vercel Pro). Transport is `simulated` unless live for that person (`docs/push.md`).
- W4 (WGR-02/07, DEV-01/02/04/06) adds device notification settings, a personal draft-reminder consent and sign-out cleanup. The settings are visible where the server has a VAPID public key, and delivery is simulated. Migration `0057` is already applied on staging and production.

- W3 (WGR-01) adds migration `0057_push_subscriptions.sql`.

- W2 adds service worker v1, the public offline page and the notification deep-link bridge with draft and checkout protection. `PWA_SW_ENABLED` is optional and unset by default. W2 requires no migration.

- W1a adopts FlyLabs Kit `pwa` 1.0, removes the installed app's portrait lock, and opens the future service worker path to anonymous requests. No migration or configuration is required. [PWA rollout note](./2026-11-26-pwa-base.md)

## Recent releases

- **1.54.0** (2026-11-26): the deadline reads the same everywhere, and moving the close of an open cycle notifies members (PR #475).
- **1.53.0** (2026-11-23): Treasury records manual credits and charges with a reason and a balance preview (PR #473).
- **1.52.3** (2026-11-22): compact Admin cycle activity and a searchable cycle picker (PRs #468, #469 and #471).
- **1.52.2** (2026-11-20): updated FlyLabs signature and post-transfer release workflow fixes.
- **1.52.1** (2026-11-20): the WeGrocery Console (`console/`) is removed; the FlyLabs Console (https://console.flylabs.ai) reads all instances and runs the fleet work for white-label apps (redeploy, rollout, *Migrazioni*, new group wizard). Production migrations stay manual (rollout order 1000). The maintainer deletes the old `wegrocery-console` Vercel project and its database.
- **1.52.0** (2026-11-20): Content Security Policy enforced (Report-Only since 1.47.2; no `csp-report` on production from 2026-11-17 to 2026-11-20). Violations are `csp-report` lines in the Vercel runtime logs.
- **1.51.0** (2026-11-18): Console fleet migrations (kit C2), sign-in for the automated staging check, listing import fixes.
- **1.47.0 to 1.50.0** (2026-11-15/16): draft reminders (migration `0055`), security headers and encrypted backups with a restore test that decrypts them, kit modules `pagamenti` (migration `0056_stripe_events`), `email` 2.0, `auth`, `sicurezza`, `i18n`, `migrazioni` (adds `_migrations.checksum` on first run), `ui` 1.1 and `shell` 1.1. Details in `CHANGELOG.md` and the release PRs.

WP0 is done (2026-11-11): the repositories are under `flylabs-ai` and the Vercel projects are in the Flylabs team.

## Released in 1.45.0, off by default

Launch phase 1 ([plan](./2026-11-07-launch-phase1.md)): terms and privacy acceptance, open sign-up and `/aderisci`, public page `/gruppo`, member import from CSV, limited quantities (also from the listing import). Better Auth 1.7.18 (GHSA-965c-763c-88jm, not exploitable here; sign-in links emailed before the deploy stopped working, codes did not). `/api/health` checked on every deploy from GitHub Actions.

Still to do before a group turns on limited quantities with card payments: a Stripe sandbox run on staging (a Checkout that holds the units, a late payment refunded when the product ran out).

## Planned and in progress

- Launch phase 2, "safe fleet": executable spec in `docs/2026-11-09-launch-phase2-fleet.md`. Work packages in order: WP0 (done 2026-11-11), WP1 (invariants per instance), WP2 (backups and restore tests, private repo `flylabs-ai/wegrocery-backups`), WP3 (data export), WP4 (shared sender), WP5 (subdomains), WP6 (rollouts). One PR per work package to `staging`. Choices marked **[default]** stand unless the maintainer changes them; steps marked **Maintainer** (transfers, private repo, secrets, keys, domain) are done by him, so stop and ask when one blocks you.
- Possible next steps, undecided: comments from members on the calendar and Home; moving more pieces (planned cycles) into the FlyLabs Kit.

## Known open items

- Manual backup dispatch: an agent with the GitHub connector can start `backup.yml` (done for 1.47.0 and 1.47.1); the GitHub CLI credential on the maintainer's computer still gets 403 on dispatch.
- The backup's rclone remote uses rclone's shared Google Drive client id, which rclone says stops working during 2026: the maintainer should create his own client id (https://rclone.org/drive/#making-your-own-client-id) and update `RCLONE_CONFIG`.

- Issue #383: Dependabot advisories that do not affect the app (tracking).
- Issue #111: ESLint 10, blocked upstream by `eslint-config-next`.
- Issue #199: turn `set-state-in-effect` back on.

## Where the rest of the context lives

The repository is public, so specs with group details, business plans and the maintainer's to-do list are kept outside it, in the maintainer's private notes (see "Context outside the repository" in `AGENTS.md`). An agent without access to them works from this file, `AGENTS.md` and the dated plans in `docs/`, and asks the maintainer for anything else.
