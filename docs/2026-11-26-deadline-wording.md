# Deadline wording and the deadline-changed notice (2026-11-26)

## Why
A planned cycle was opened by hand at 07:07 with its close on Saturday at 19:00; six minutes later an admin moved the close to 12:00. Home showed 12:00 (it reads the cycle), the "Nuovo ciclo aperto" notice still said 19:00 (a notice's body is text written when it is sent), and nobody was told about the change. Home and the notice also wrote the same deadline in two styles ("sabato 28 nov, ore 12:00" and "sab 28 nov, 19:00"), and Home repeated "Ritiro previsto ..., da confermare" once per pickup day.

## What changes
1. `cycle_deadline_changed` (category `cycle_opened`, no new preference): `adminUpdateCycle` sends it when the close of an **open** cycle changes as members read it, to the same audience as `cycle_opened` (`notifyCycleAudience`). Title "Chiusura anticipata" or "Chiusura posticipata", body with the new and the old deadline. Nothing when the new close has already passed. The edit form of an open cycle says so under the close field.
2. One wording for members, in `lib/i18n/deadline.ts`: `formatDeadlineLong` ("sabato 28 nov, ore 12:00", `t.cycle.deadline` per locale) on Home, the calendar, the order page, notifications and emails; `formatPickupsLong` puts two pickups with the same hours on one line ("mercoledì 9 e giovedì 10 dic, 18:30–20:30"), also in the pickup notices. Admin cards keep the compact `formatDeadline` ("sab 28 nov · 12:00").

## Not done
Rendering stored notices from the cycle's current data (a `cycle_id` and parameters on `notifications`, a migration): with the notice above it is not needed.

No migration, no environment variable, no money path touched.
