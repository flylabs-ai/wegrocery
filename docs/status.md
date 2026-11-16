# Status: where the work stands

The living snapshot of what is released, what waits on `staging` and what is planned. Any agent (Claude Code, Codex or another) reads it before starting and updates it in the same PR that changes the picture: a release, a migration applied somewhere, a plan approved or dropped. Keep it short; the detail lives in `CHANGELOG.md`, the dated plans in `docs/` and the PRs.

Last updated: 2026-11-15 (release 1.47.2 is in production, on the demo and on the example brand: report-only Content Security Policy; no migration).

## Versions and migrations

| Installation | Version | Migrations applied |
|---|---|---|
| Production (`main`) | 1.47.2 (2026-11-15) | up to `0055` |
| Public demo (`main`) | 1.47.2 | up to `0055` |
| Example brand installation | 1.47.2 | up to `0055` (migrates on build) |
| Staging (`staging`) | 1.47.2 | up to `0055` (2026-11-14, Neon branch `staging`) |

## Waiting on `staging` for the next release

Admin "order for a member" (PR #443): fixes the form that replaced a member's existing order instead of adding to it (both admin order actions now refuse a save whose starting lines are not the member's current order), and turns the member dropdown into a list of who already ordered (Edit) and who has not (Add). No migration.

FlyLabs Kit `pagamenti` 1.0 adopted for the Stripe webhook (signature, live/test check and the `stripe_events` register, migration `0056_stripe_events.sql`, same answers to Stripe). Migration 0056 must be applied to production and the demo before the release deploys.

FlyLabs Kit modules `sicurezza` 1.0 and `i18n` 1.0 adopted (security headers, report-only CSP, CSP report endpoint and cron check from the kit, same policy as 1.47.2; parity test of the four language packs against Italian, with the bank reference template placeholders listed as translated on purpose). Next planned: enforce the Content Security Policy (`Content-Security-Policy` instead of `-Report-Only`) after a week of `csp-report` lines without real violations, around 2026-11-22. On staging the only report so far is `frame-src https://vercel.live` (Vercel's preview toolbar, not on production).

FlyLabs Kit module `migrazioni` 1.0 prepared (PR to staging, not merged yet on purpose: it goes in after the work in progress). On its first run on each database it adds the nullable `checksum` column to `_migrations` and fills it from the local files without running them; then applied files are immutable. Commands take `--dir drizzle`. The role helpers moved to `scripts/db-role-lib.mjs`.

Latest release: version 1.47.2 (report-only Content Security Policy with a per-request nonce and the `/api/csp-report` endpoint, PR #428) was released on Sunday 2026-11-15 through PR #430 (merge commit `89c07e2`) at the maintainer's explicit request, after the maintainer tried Google sign-in and a card payment on staging with the policy on. No migration and no data change. Staging was fast-forwarded to `main` and the example brand aligned (`c3738df`). `/api/health` on production, demo and example brand reports `ok: true`, `db: true`, version `1.47.2`; production `/login` sends the policy with a nonce; the GitHub release workflow published `v1.47.2`.

Release before: version 1.47.1 (security headers on every response, PR #424; daily backup encrypted with age and restore test that decrypts it, PR #425) was released on Sunday 2026-11-15 through PR #426 (merge commit `d6a87a9`) at the maintainer's explicit request. The encrypted manual backup run `43731285946` was green first (`gas-backup-2026-11-15.sql.gz.age` uploaded, invariants passed) and restore test run `43731468165` decrypted it, restored it on a throwaway branch and found every money invariant holding. No migration. Staging was fast-forwarded to `main` and the example brand aligned (`078f796`). `/api/health` on production, demo and example brand reports `ok: true`, `db: true`, version `1.47.1`; production answers `/login`, `/api/health` and an unknown path with the five headers and no `X-Powered-By`; Deploy Health passed; the GitHub release workflow published `v1.47.1`; no runtime errors after the deploy. From now on the daily backup fails instead of uploading if `BACKUP_AGE_RECIPIENT` is missing; the unencrypted dumps already on Drive expire after 90 days.

Previous release: version 1.47.0 (draft visibility for admins, draft reminders, draft summaries and filters; PRs #418 to #421, migration `0055_draft_reminders.sql`) was released on Sunday 2026-11-15 through PR #423 (merge commit `6ed0274`), with the maintainer's explicit weekend exception. Manual backup run `43718997359` was green first (dump uploaded, invariants passed). Migration `0055` was then applied to production and the demo in one transaction with a 5 s lock timeout; on both, `_migrations` holds 56 rows, `draft_reminders` has its primary key and two foreign keys, and `app_rw` has SELECT, INSERT, UPDATE and DELETE on it and still cannot write `_migrations`. Staging was fast-forwarded to `main` and the example brand aligned (`7946d26`). `/api/health` on production, demo and example brand reports `ok: true`, `db: true`, version `1.47.0`; Deploy Health passed on the release commit; the GitHub release workflow published `v1.47.0`; no runtime errors in the first minutes. The smoke test ran on the demo (login, Home, Order, Admin, Profile, changelog); production was checked without a session only (login page 200, cron endpoints 404 without the secret), so a signed-in look by the maintainer is still due. Draft reminders now run at 05:00 and 17:00 UTC where `CRON_SECRET` is set.

WP0 is done (2026-11-11): the repositories are under `flylabs-ai`, and all four Vercel projects (porta-moneta, demo, example brand, Console) are in the Flylabs team.

## Released in 1.45.0, off by default

Launch phase 1 ([plan](./2026-11-07-launch-phase1.md)): terms and privacy acceptance, open sign-up and `/aderisci`, public page `/gruppo`, member import from CSV, limited quantities (also from the listing import). Better Auth 1.7.18 (GHSA-965c-763c-88jm, not exploitable here; sign-in links emailed before the deploy stopped working, codes did not). `/api/health` checked on every deploy from GitHub Actions.

Still to do before a group turns on limited quantities with card payments: a Stripe sandbox run on staging (a Checkout that holds the units, a late payment refunded when the product ran out).

## Planned and in progress

- Launch phase 2, "safe fleet": executable spec in `docs/2026-11-09-launch-phase2-fleet.md`. Work packages in order: WP0 (move the repositories to `flylabs-ai` and the Vercel projects to the Pro account, the maintainer wants it first), WP1 (invariants per instance), WP2 (backups and restore tests, private repo `flylabs-ai/wegrocery-backups`), WP3 (data export), WP4 (shared sender), WP5 (subdomains), WP6 (rollouts). One PR per work package to `staging`. Choices marked **[default]** stand unless the maintainer changes them; steps marked **Maintainer** (transfers, private repo, secrets, keys, domain) are done by him, so stop and ask when one blocks you. WP0 A.1 is released in 1.45.1. The maintainer next verifies organization 2FA/ownership, transfers both repositories, installs the GitHub Apps and reconnects Claude/Codex. Parts A.3/A.4 and B remain pending.
- Possible next steps, undecided: comments from members on the calendar and Home; moving more pieces (planned cycles) into the FlyLabs Kit.

## Known open items

- Deploy Health on release commit `3015523`: runs `42621910904` (Console) and `42621987253` (demo) received HTTP 302 from deployment URLs. Production/staging checks passed and the demo public health endpoint reports healthy 1.45.1. Investigate deployment URL redirects and the Console-specific health contract separately; do not treat these failed runs as green.
- Manual backup dispatch: an agent with the GitHub connector can start `backup.yml` (done for 1.47.0 and 1.47.1); the GitHub CLI credential on the maintainer's computer still gets 403 on dispatch.
- The backup's rclone remote uses rclone's shared Google Drive client id, which rclone says stops working during 2026: the maintainer should create his own client id (https://rclone.org/drive/#making-your-own-client-id) and update `RCLONE_CONFIG`.

- Issue #383: Dependabot advisories that do not affect the app (tracking).
- Issue #111: ESLint 10, blocked upstream by `eslint-config-next`.
- Issue #199: turn `set-state-in-effect` back on.

## Where the rest of the context lives

The repository is public, so specs with group details, business plans and the maintainer's to-do list are kept outside it, in the maintainer's private notes (see "Context outside the repository" in `AGENTS.md`). An agent without access to them works from this file, `AGENTS.md` and the dated plans in `docs/`, and asks the maintainer for anything else.
