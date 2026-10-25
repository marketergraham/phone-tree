import { DateTime } from "luxon";

export const SLOTS = [
  { key: "early", label: "Early morning", hours: "5 – 8 am", from: 5, to: 8 },
  { key: "morning", label: "Morning", hours: "8 am – 12 pm", from: 8, to: 12 },
  { key: "afternoon", label: "Afternoon", hours: "12 – 5 pm", from: 12, to: 17 },
  { key: "evening", label: "Evening", hours: "5 – 8 pm", from: 17, to: 20 },
  { key: "late", label: "Late evening", hours: "8 pm – midnight", from: 20, to: 24 },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function slotKey(weekday: number, slot: string) {
  return `${weekday}:${slot}`;
}

/**
 * Availability slots a job touches, as "weekday:slot" keys.
 * Hours between midnight and 5 am count as the previous day's late evening.
 */
export function jobSlots(startsAt: Date, endsAt: Date, tz: string): string[] {
  const keys = new Set<string>();
  let t = DateTime.fromJSDate(startsAt, { zone: tz });
  const end = DateTime.fromJSDate(endsAt, { zone: tz });
  // Walk in 15-minute steps; jobs are short so this is cheap and exact enough.
  while (t < end) {
    const h = t.hour + t.minute / 60;
    if (h < 5) {
      keys.add(slotKey(t.minus({ days: 1 }).weekday, "late"));
    } else {
      const s = SLOTS.find((x) => h >= x.from && h < x.to)!;
      keys.add(slotKey(t.weekday, s.key));
    }
    t = t.plus({ minutes: 15 });
  }
  return [...keys];
}

/** "Saturday evening & late evening" style description of the slots a sitter is missing. */
export function describeSlots(keys: string[]): string {
  const byDay = new Map<number, string[]>();
  for (const k of keys) {
    const [d, s] = k.split(":");
    const label = SLOTS.find((x) => x.key === s)!.label.toLowerCase();
    byDay.set(Number(d), [...(byDay.get(Number(d)) ?? []), label]);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, labels]) => `${WEEKDAY_NAMES[d - 1]} ${labels.join(" & ")}`)
    .join(" and ");
}

export type TextingHours = { tz: string; startMin: number; endMin: number };

export function insideTextingHours(at: Date, h: TextingHours): boolean {
  const t = DateTime.fromJSDate(at, { zone: h.tz });
  const m = t.hour * 60 + t.minute;
  return m >= h.startMin && m < h.endMin;
}

/** The first moment at or after `at` that's inside texting hours. */
export function nextTextingTime(at: Date, h: TextingHours): Date {
  if (insideTextingHours(at, h)) return at;
  const t = DateTime.fromJSDate(at, { zone: h.tz });
  const m = t.hour * 60 + t.minute;
  let day = t.startOf("day");
  if (m >= h.endMin) day = day.plus({ days: 1 });
  return day.plus({ minutes: h.startMin }).toJSDate();
}

export function local(at: Date, tz: string) {
  return DateTime.fromJSDate(at, { zone: tz });
}

/** "Sat Oct 24" */
export function fmtDay(at: Date, tz: string) {
  return local(at, tz).toFormat("ccc LLL d");
}
/** "Sat 10/24" */
export function fmtShortDay(at: Date, tz: string) {
  return local(at, tz).toFormat("ccc M/d");
}
/** "6:00 pm" */
export function fmtTime(at: Date, tz: string) {
  return local(at, tz).toFormat("h:mm a").toLowerCase();
}
/** "6:00–11:00 pm" or "11:00 am–2:00 pm" */
export function fmtRange(start: Date, end: Date, tz: string) {
  const s = local(start, tz);
  const e = local(end, tz);
  const sameHalf = s.toFormat("a") === e.toFormat("a");
  const left = sameHalf ? s.toFormat("h:mm") : s.toFormat("h:mm a").toLowerCase();
  return `${left}–${e.toFormat("h:mm a").toLowerCase()}`;
}
/** "Sat 10/24 · 8:00 am" for timelines. */
export function fmtStamp(at: Date, tz: string) {
  return `${fmtShortDay(at, tz)} · ${fmtTime(at, tz)}`;
}

export function money(cents: number | null | undefined) {
  if (cents == null) return null;
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+\d{10,15}$/.test(digits)) return digits;
  const d = digits.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

export function prettyPhone(e164: string) {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
