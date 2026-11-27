# Web Push operations

## Enable by environment

Leave `PUSH_TRANSPORT` unset or set it to `simulated` on previews, staging
and demos. Set `PWA_SW_ENABLED=true` to register the service worker. Provision
a dedicated VAPID pair outside the repository with an approved Web Push
tool. Store `VAPID_PRIVATE_KEY` as a sensitive server-side variable, and set
`VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` for the same deployment. The subject is
a contact address in `mailto:` or HTTPS form.

With the variables loaded in the operator's shell, run
`node scripts/vapid-check.mjs`. It reports coherence and the first eight hex
digits of the public-key hash. On Vercel, check the push state in
`/api/health` or the signed instance stats. The FlyLabs signature
contract also exposes daily totals in the Console's standard counters.

Live delivery requires the exact value `PUSH_TRANSPORT=live` and a
non-demo Vercel Production deployment, or an explicitly segregated HTTPS
origin configured in `PUSH_SEGREGATED_ORIGIN`. For a segregated
installation on Vercel, use the actual deployment origin (`VERCEL_URL`).
For self-hosting, use the exact origin configured in `APP_BASE_URL`.
Keep the segregated instance's database and VAPID keys separate.

## Production pilot

Configure `PUSH_PILOT_MEMBER_IDS` in Production only. Start with the test
account holders for Federico and Cesare. Enter their signed-in person IDs
as a comma-separated list in the hosting dashboard. Observe daily delivery
and failure totals for 7–14 days. With approval, remove the variable and
redeploy to end the restriction. An explicitly empty pilot list permits
no recipients.

## Diagnose delivery

Use daily UTC totals to compare simulated, accepted, expired, skipped,
failed and opened events. An acceptance means the provider accepted the
message. A 401 or 403 calls for a VAPID pair and contact check, then a check
that devices subscribed with the current public key.

On iOS or iPadOS, add the site to the Home Screen, open it from there, and
enable notifications from the app settings with a tap. Check system
notification permission, Focus settings, the installed origin, and whether
the service worker is registered. Disconnect and re-enable a stale device
after checking the configured key.

## Stop, rotate or roll back

Set `PUSH_TRANSPORT` to `simulated` and redeploy to stop live delivery.
Verify the new push state in health. To rotate VAPID keys, stop delivery,
set the replacement pair and contact, check coherence, and redeploy.
Ask pilot members to disconnect and re-enable devices so their browser
subscribes using the new public key. Confirm the replacement subscriptions
before restoring live delivery.

For a worker rollback, set `PWA_SW_ENABLED=false` and redeploy. The app
unregisters its worker when clients next load it. Restore the last known
working worker and set `PWA_SW_ENABLED=true` to register it again.
