# Operating the environments: production, staging, demo

WeGrocery runs as **Vercel deployments from this single repository**. They
share 100% of the code and differ only in environment variables (and, for
staging, in the Git branch they build from).

| | Production | Staging | Demo |
|---|---|---|---|
| URL | `gas.portamoneta.org` | branch URL of `staging` on `porta-moneta` (see below) | `wegrocery-demo.vercel.app` |
| Vercel project | `porta-moneta` (client: Porta Moneta) | `porta-moneta`, Preview deployment | `wegrocery-demo` |
| Git branch | `main` | `staging` | `main` |
| Database | production Neon (real members) | Neon branch `staging` (a copy of production, shared with local dev and previews) | separate demo Neon (fake data) |
| `DEMO_MODE` | unset | unset | `true` |
| Auth | Google OAuth + member whitelist | same, with the staging redirect URI | one-click Socio/Admin demo login |
| Outbound email | Resend | redirected to `EMAIL_REDIRECT_TO` | disabled |
| Data | real, persistent | real copy, resettable (reset on demand) | reseeded nightly |

The staging deployment, local dev and ordinary PR previews all use the Neon
branch `staging` (called `dev` until 2026-11-06), which is why a reset of that
branch resets all three (see AGENTS.md → "Database environments & access").

## Names

One rule since 2026-11-06: an installation has one name, used the same way in
Vercel, Neon and GitHub (`wegrocery-<installation>`; Porta Moneta's Vercel
project keeps its historical name `porta-moneta`). IDs never changed, so env
vars and secrets did not either.

| Installation | Vercel project | Neon organisation / project (id) | Neon branches | Repository |
|---|---|---|---|---|
| Porta Moneta | `porta-moneta` | WeGrocery / `wegrocery-porta-moneta` (`small-breeze-14972344`) | `production`, `staging`, `backup-YYYY-MM-DD-<reason>` | `wegrocery` (`main`, `staging`) |
| Demo | `wegrocery-demo` | WeGrocery / `wegrocery-demo` (`flat-river-33694745`) | `production`; CI's throwaway `ci-*` | `wegrocery` (`main`) |
| Example brand | `wegrocery-example-brand` | Vercel: WeGrocery / `wegrocery-example-brand` (`cold-sound-43697431`) | `main` (managed by Vercel) | `wegrocery-example-brand`, a copy updated from upstream |
| Console | `wegrocery-console` | Vercel: WeGrocery / `wegrocery-console` (`icy-river-98732942`) | `main` (managed by Vercel) | `wegrocery`, folder `console/` |
| Restore test | none | WeGrocery / `wegrocery-restore-test` (`late-frost-62618439`) | throwaway `restore-*` | `wegrocery` (`restore-test.yml`) |

Git keeps two long-lived branches, `main` (production) and `staging`; every
other branch is deleted when its PR closes ("Automatically delete head
branches" is on). Name a manual backup branch of production
`backup-YYYY-MM-DD-<reason>` and delete it once a newer backup exists.
`wegrocery-example-brand` is a separate repository on purpose: it is installed
the way another group would install WeGrocery (the Deploy button, the Neon
integration, `MIGRATE_ON_BUILD`, updates merged from upstream), so it tests
that path before a real group meets it.

## One codebase, env-driven differences

Demo behaviour is **not** a branch or a fork. It lives behind the `DEMO_MODE`
flag:

- `auth.ts` registers the `demo-login` Credentials provider only when `DEMO_MODE=true`.
- `components/demo-banner.tsx` renders the banner only when the flag is on.
- `lib/email/resend.ts` short-circuits `sendMail` in demo so no mail is sent.

With the flag unset (production) none of that code path is reachable.

Both Vercel projects are connected to this repo with **Production Branch `main`**
and **Root Directory at repo root** (empty / not set). A merge to `main` rebuilds
both deployments automatically, each with its own env. Features stay in sync by
construction: it is the same commit.

**When adding a feature, ask how it behaves under `DEMO_MODE` and outside
production.** If it introduces an external side-effect (email, payments,
third-party calls), add a demo guard like the one in `sendMail`, and make sure
staging and previews cannot reach real people or real money: they run on a
copy of the production member list.

## Staging

Staging is where a change is tested end to end, on a copy of real data, before
it reaches `main` (and therefore production and the demo).

### Git flow

- Development PRs target **`staging`**, not `main`.
- `staging` → `main` only after the change has been tested on staging, through
  a PR and the promotion checklist below. Merge it with **"Create a merge
  commit"**, not squash, so the two branches do not diverge.
- Dependabot opens its PRs against the default branch (`main`). Routine
  bumps can keep going there; anything risky goes through `staging` first.

### Vercel: Preview deployment of the `staging` branch

Staging is **not** a separate Vercel project: it is the Preview deployment that
`porta-moneta` builds for every push to `staging`. Vercel gives each Git branch
a stable URL that always points to its latest deployment
(`porta-moneta-git-staging-<scope-slug>.vercel.app`), and the project's
Domains settings attach `gas-staging.portamoneta.org` to the `staging` branch
(a CNAME to Vercel in the `portamoneta.org` zone). Both keep working; the
custom domain is the one in `APP_BASE_URL`, Google's redirect and the cloud
agents' allowed domains. Preview deployments sit behind Vercel's Deployment
Protection: log in to Vercel first, or send a Protection Bypass for
Automation key.

Environment variables on `porta-moneta` → Settings → Environment Variables,
environment **Preview**, **Git branch `staging`**. A branch-specific value
overrides the generic Preview value of the same name, so only the differences
need to be set:

| Variable | Staging value |
|---|---|
| `DATABASE_URL` | connection string of the Neon branch `staging` (the database every Preview uses) |
| `EMAIL_REDIRECT_TO` | the tester's inbox (every email goes there, cc dropped, subject tagged `[STAGING -> <recipient>]`; broadcasts to all members are capped to 3 samples). Scoped to the `staging` branch only: ordinary PR previews, on the same `staging` database, have no value and refuse to send any email |
| `APP_BASE_URL` | `https://gas-staging.portamoneta.org`, so email links do not point at production |
| `PREVIEW_LOGIN_SECRET`, `PREVIEW_LOGIN_EMAILS` | the automated staging check's sign-in (next section). Branch `staging` only, never Production |
| `WALLYFOR_*` | membership-check credentials (the same read-only check as production) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe **sandbox** keys only (the app refuses live keys outside production). The sandbox webhook endpoint is `<staging URL>/api/stripe/webhook?x-vercel-protection-bypass=<secret>`, with the secret from Settings → Deployment Protection → Protection Bypass for Automation |

`EMAIL_REDIRECT_TO` must **never** be set on Production. Outside
`VERCEL_ENV=production` (staging, previews, local dev) the app refuses to send
any email unless it is set: this is the safety net for the real addresses in
the copied data.

### Automated staging check

An agent checks staging on its own after a merge: `scripts/staging-check.mjs`
waits for `/api/health` to show the new version, signs in through
`POST /api/auth/preview/sign-in` (header `x-preview-login-secret`) as the two
test members of `PREVIEW_LOGIN_EMAILS`, and opens the main pages on an iPhone,
an Android phone, an iPad and a desktop with screenshots and axe. It only
reads. The route exists only when `VERCEL_ENV=preview` and both variables are
set (`lib/auth/preview-login.ts`), accepts only `@example.com` addresses of
members that already exist and are active, and gives a two-hour session.

The two test members live in the Neon branch `staging` (a reset of the branch
removes them: add them again with the SQL below, Neon console or MCP):

```sql
INSERT INTO members (member_id, full_name, email, role, active, created_at, updated_at) VALUES
  ('mem_preview_user', 'Prova Claude (socio)', '<member address>', 'utenti', true, now(), now()),
  ('mem_preview_admin', 'Prova Claude (admin)', '<admin address>', 'admin', true, now(), now())
ON CONFLICT (member_id) DO NOTHING;
```

The agent needs `PREVIEW_LOGIN_SECRET` and the Deployment Protection bypass key
(`VERCEL_STAGING_BYPASS`, a key of its own named `claude-staging`) in its
environment, and `gas-staging.portamoneta.org` among its allowed domains.

### Google OAuth

In Google Cloud Console → the OAuth client used by production → *Authorized
redirect URIs*, add:

```
https://gas-staging.portamoneta.org/api/auth/callback/google
```

Only a stable URL works (the custom domain or the branch URL): per-commit URLs
change on every push and cannot be whitelisted.

### Database: the Neon branch `staging`

Staging runs on the Neon branch `staging` of project `wegrocery-porta-moneta`
(`small-breeze-14972344`), a copy-on-write child of `production` that local
development and ordinary PR previews use as well. It is throwaway data. It was
called `dev` until 2026-11-06 (same id, `br-blue-morning-alztuzoj`). Because the data is a copy of
production, the real member addresses are in it, and `EMAIL_REDIRECT_TO` is
what keeps staging from mailing them.

Refresh it from current production data (this **destroys** everything written
on the `staging` branch, so on staging and on every preview too, including migrations not yet
on production):

```bash
npx -y neonctl branches reset staging --parent \
  --project-id small-breeze-14972344 --org-id org-gentle-violet-55538692
```

After a reset, re-apply the pending migrations to `staging` (next section).

## Database migrations

Migrations are hand-written `drizzle/NNNN_*.sql` files (additive, idempotent,
pre-flight query in the header) applied with `scripts/db-migrate.mjs`, which
records applied files in `_migrations`. Order: **staging first, then
production**, then demo.

```bash
# 1. staging = the Neon branch "dev" (what `npm run db:migrate` targets
#    with .env.local)
DATABASE_URL="…dev…" node scripts/db-migrate.mjs --dir drizzle --status
DATABASE_URL="…dev…" node scripts/db-migrate.mjs --dir drizzle

# 2. production — only at promotion time, with explicit confirmation,
#    after running the pre-flight query from the file header
#    (with PRODUCTION_DB_HOST set to the production host, the script refuses
#    it unless --allow-prod is passed: set it in your local env files)
DATABASE_URL="…production…" node scripts/db-migrate.mjs --dir drizzle --allow-prod

# 3. demo (reads .env.demo.local)
node --env-file=.env.demo.local scripts/db-migrate.mjs --dir drizzle
```

Each file runs in one transaction with a 5 s lock timeout, together with its
`_migrations` record: a failure leaves the database as it was. A statement
that cannot run in a transaction (`CREATE INDEX CONCURRENTLY`, `VACUUM`) is
refused before anything is applied: use a plain `CREATE INDEX`. A new migration
starts with a header saying what it does, the exact command (`Apply:`) and how
to undo it (`Rollback:`), and comes with `NNNN_name_down.sql`, the rollback as
SQL. The runner never applies a `_down.sql`; run it by hand, on `staging` first,
and delete the `_migrations` row of the file it undoes. A new migration also
gets a test (`test/int/migration-NNNN.integration.test.ts`) or a case in an existing one.

If you add a table or a non-null column, update `scripts/seed-demo.ts`
too, otherwise the nightly reset (`.github/workflows/demo-reset.yml`) will fail.

## Promotion checklist: staging → main

1. **Staging is green**: CI passes on the `staging` head, and the change was
   tested by hand on the staging URL (flows touched by the change, plus a
   login and the home balance).
2. **Manual backup**: Actions → "Daily Neon Backup" → *Run workflow*, and check
   the new `gas-backup-YYYY-MM-DD.sql.gz.age` on Drive. For a risky migration also
   create a Neon branch from `production` (e.g. `pre-release-YYYYMMDD`) as an
   instant restore point.
3. **Migrations on production**: `--status` shows the expected pending files;
   run each file's pre-flight query (must return 0 rows), then apply. Then demo.
4. **Changelog**: release cut in both `CHANGELOG.md` and `CHANGELOG.it.md`.
5. **Merge** the `staging` → `main` PR (merge commit). Vercel redeploys
   production and the demo.
6. **Smoke test production**: login, home balance, order page, admin panel,
   and the feature just shipped; check the Vercel runtime logs for errors. If
   something is wrong, use Vercel's Instant Rollback to the previous production
   deployment (additive migrations stay compatible with the previous code).

## Changelogs: shared product, separate demo

- **Product changelog** — `CHANGELOG.md` + `CHANGELOG.it.md`. Real app
  features (orders, ledger, analytics). Applies to both environments. This is
  what members and repo visitors read.
- **Demo-only changes** — `DEMO_MODE`, seed, nightly reset, demo login, banner —
  go in the "Demo environment changelog" section below, **not** in the product
  changelog.

Rule of thumb: if a line describes an **app capability**, it belongs in the
product changelog. If it describes the **showcase infrastructure**, it belongs
in the demo changelog.

### Demo environment changelog

- **2026-06-10** — Initial demo mode: `DEMO_MODE` flag, one-click Socio/Admin
  login, persistent banner, outbound email disabled, idempotent seed
  (`npm run db:seed:demo`), nightly reset workflow, separate Neon database and
  Vercel project.

## Public vs private links

- **`gas.portamoneta.org` is private.** Login is whitelisted and the data is
  real. Share it only with cooperative members. Never use it for screenshots,
  demos, or public links.
- **The staging URL is private too.** It serves a copy of the real data:
  same rules as production.
- **`wegrocery-demo.vercel.app` is the public showcase.** Use it in the
  README, in any demo, and for all screenshots/GIFs (the `docs/demo.gif`
  walkthrough was recorded here).
