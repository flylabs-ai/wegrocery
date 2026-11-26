import { t } from "@/lib/i18n";
import { formatDate, formatTime } from "./format";
import { utcToZonedLocalInput } from "./zoned-time";

// One way to write a cycle's deadline and pickup everywhere. Two styles, by
// place and not by page:
// - in a sentence, for members (Home, calendar, order page, notifications,
//   emails): "sabato 28 nov, ore 12:00", "mercoledì 9 dic, 18:30–20:30";
// - compact, for admin cards and tight lists: "sab 28 nov · 12:00".
// The stored value never changes: only how it reads.

const MINUTE_MS = 60_000;

/** Midnight in the app zone: a pickup with no time, or a deadline "at the end of the day before". */
export function isZonedMidnight(d: Date): boolean {
  return utcToZonedLocalInput(d).endsWith("T00:00");
}

/** A close at 00:00 reads as 23:59 of the day before: what the admin meant ("orders until Monday night"). */
function shownDeadline(value: Date | string): Date {
  const d = typeof value === "string" ? new Date(value) : value;
  return isZonedMidnight(d) ? new Date(d.getTime() - MINUTE_MS) : d;
}

/** Compact, for admin cards: "lun 12 ott · 23:59". */
export function formatDeadline(value: Date | string): string {
  const shown = shownDeadline(value);
  return `${formatDate(shown, { weekday: "short", day: "numeric", month: "short" })} · ${formatTime(shown)}`;
}

/**
 * "mer 15 ott · 18:00–20:00", or the date alone for a pickup with no time.
 * `long` writes the weekday and month in full (emails).
 */
export function formatPickupSlot(value: Date | string, endTime: string | null, long = false): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = formatDate(d, long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  if (isZonedMidnight(d)) return day;
  const start = formatTime(d);
  return `${day} · ${endTime ? `${start}–${endTime}` : start}`;
}

/**
 * The cycle's pickups on one line when they share the hours:
 * "mer 15 e gio 16 ott · 18:00–20:00"; otherwise each with its own.
 */
export function formatPickups(
  first: { date: Date | string; endTime: string | null } | null,
  second: { date: Date | string; endTime: string | null } | null,
): string[] {
  if (!first) return [];
  if (!second) return [formatPickupSlot(first.date, first.endTime)];
  const a = new Date(first.date);
  const b = new Date(second.date);
  const sameHours = (isZonedMidnight(a) && isZonedMidnight(b)) ||
    (!isZonedMidnight(a) && formatTime(a) === formatTime(b) && (first.endTime ?? "") === (second.endTime ?? ""));
  if (!sameHours) return [formatPickupSlot(a, first.endTime), formatPickupSlot(b, second.endTime)];
  const hours = isZonedMidnight(a) ? "" : ` · ${first.endTime ? `${formatTime(a)}–${first.endTime}` : formatTime(a)}`;
  const sameMonth = formatDate(a, { month: "short" }) === formatDate(b, { month: "short" });
  const left = formatDate(a, sameMonth ? { weekday: "short", day: "numeric" } : { weekday: "short", day: "numeric", month: "short" });
  const right = formatDate(b, { weekday: "short", day: "numeric", month: "short" });
  return [`${t.cycle.pickupDays(left, right)}${hours}`];
}

const LONG_DAY: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "short" };

/**
 * A deadline in two parts for a sentence ("Ordina entro venerdì 6 nov, ore
 * 21:14"): the weekday in full, which is how members plan. A close at 00:00
 * reads as 23:59 of the day before, as in formatDeadline.
 */
export function deadlineParts(value: Date | string): { day: string; time: string } {
  const shown = shownDeadline(value);
  return { day: formatDate(shown, LONG_DAY), time: formatTime(shown) };
}

/**
 * The deadline in a sentence, for members: "sabato 28 nov, ore 12:00". Home,
 * the calendar, the order page, the notifications and the emails all use it,
 * so a member reads the same words wherever they look.
 */
export function formatDeadlineLong(value: Date | string): string {
  const { day, time } = deadlineParts(value);
  return t.cycle.deadline(day, time);
}

/** "lunedì 9 nov, 17:15–19:00", or the day alone for a pickup with no time. */
export function formatPickupLong(value: Date | string, endTime: string | null): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = formatDate(d, LONG_DAY);
  if (isZonedMidnight(d)) return day;
  const start = formatTime(d);
  return `${day}, ${endTime ? `${start}–${endTime}` : start}`;
}

/**
 * The cycle's pickups in a sentence: one line when they share the hours,
 * "mercoledì 9 e giovedì 10 dic, 18:30–20:30"; otherwise a line each.
 */
export function formatPickupsLong(
  first: { date: Date | string; endTime: string | null } | null,
  second: { date: Date | string; endTime: string | null } | null,
): string[] {
  if (!first) return [];
  if (!second) return [formatPickupLong(first.date, first.endTime)];
  const a = new Date(first.date);
  const b = new Date(second.date);
  const sameHours = (isZonedMidnight(a) && isZonedMidnight(b)) ||
    (!isZonedMidnight(a) && !isZonedMidnight(b) && formatTime(a) === formatTime(b) && (first.endTime ?? "") === (second.endTime ?? ""));
  if (!sameHours) return [formatPickupLong(a, first.endTime), formatPickupLong(b, second.endTime)];
  const hours = isZonedMidnight(a) ? "" : `, ${first.endTime ? `${formatTime(a)}–${first.endTime}` : formatTime(a)}`;
  const sameMonth = formatDate(a, { month: "short" }) === formatDate(b, { month: "short" });
  const left = formatDate(a, sameMonth ? { weekday: "long", day: "numeric" } : LONG_DAY);
  const right = formatDate(b, LONG_DAY);
  return [`${t.cycle.pickupDays(left, right)}${hours}`];
}

/** "giovedì 12 nov": a day in full, for the opening of a planned cycle. */
export function formatLongDay(value: Date | string): string {
  return formatDate(typeof value === "string" ? new Date(value) : value, LONG_DAY);
}
