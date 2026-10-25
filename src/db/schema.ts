import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, index, uniqueIndex, date,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One row: the family using Phone Tree. */
export const household = pgTable("household", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull().default("Graham & Susanna"),
  houseName: text("house_name").notNull().default("Blessing Way"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  /** Texting hours, minutes after local midnight. */
  textingStartMin: integer("texting_start_min").notNull().default(8 * 60),
  textingEndMin: integer("texting_end_min").notNull().default(22 * 60),
  /** Clock offset for the test simulator only (ignored with real Twilio). */
  testClockOffsetMs: integer("test_clock_offset_ms").notNull().default(0),
});

export const parents = pgTable("parents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  alerts: boolean("alerts").notNull().default(true),
});

export const providers = pgTable("providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  rateCents: integer("rate_cents"),
  tier: integer("tier").notNull().default(1),
  /** Keys like "6:evening" (ISO weekday 1=Mon … 7=Sun). */
  availability: jsonb("availability").$type<string[]>().notNull().default([]),
  joined: boolean("joined").notNull().default(false),
  joinedAt: ts("joined_at"),
  optedOut: boolean("opted_out").notNull().default(false),
  /** Has Phone Tree ever texted them (first text carries STOP instructions). */
  everTexted: boolean("ever_texted").notNull().default(false),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const awayDates = pgTable("away_dates", {
  id: serial("id").primaryKey(),
  providerId: integer("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
});

export type UnavailableMode = "none" | "end" | "start";
export type JobStatus = "draft" | "open" | "booked" | "closed" | "canceled";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  status: text("status").$type<JobStatus>().notNull().default("draft"),
  /** Letter used in replies when a sitter has more than one open offer ("1B"). */
  code: text("code"),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  rateCents: integer("rate_cents"),
  kids: text("kids"),
  note: text("note"),
  /** Hours to wait before tier 2, tier 3 … (index 0 = tier 2). */
  tierWaits: jsonb("tier_waits").$type<number[]>().notNull().default([24, 24]),
  unavailableMode: text("unavailable_mode").$type<UnavailableMode>().notNull().default("end"),
  unavailableWaitHours: integer("unavailable_wait_hours").notNull().default(12),
  remindEveryHours: integer("remind_every_hours").notNull().default(12),
  remindMax: integer("remind_max").notNull().default(3),
  remindersSent: integer("reminders_sent").notNull().default(0),
  allowAnyHour: boolean("allow_any_hour").notNull().default(false),
  closeBeforeHours: integer("close_before_hours").notNull().default(6),
  headStartMinutes: integer("head_start_minutes").notNull().default(60),
  /** Highest tier texted so far (0 = none). */
  tierSent: integer("tier_sent").notNull().default(0),
  unavailableAsked: boolean("unavailable_asked").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  bookedOfferId: integer("booked_offer_id"),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
});

/** One per sitter per job, created when they're texted. */
export type OfferReply = "none" | "yes" | "no" | "maybe" | "backup" | "dropped";
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  providerId: integer("provider_id").notNull().references(() => providers.id, { onDelete: "cascade" }),
  tier: integer("tier").notNull(),
  rateCents: integer("rate_cents"),
  /** Texted outside their usual availability. */
  outsideUsual: boolean("outside_usual").notNull().default(false),
  reply: text("reply").$type<OfferReply>().notNull().default("none"),
  repliedAt: ts("replied_at"),
  sentAt: ts("sent_at").notNull(),
}, (t) => [uniqueIndex("offers_job_provider").on(t.jobId, t.providerId)]);

export type EventType =
  | "send_tier" | "ask_unavailable" | "remind" | "head_start" | "head_start_end" | "close" | "day_reminder";
export const scheduledEvents = pgTable("scheduled_events", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  type: text("type").$type<EventType>().notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  runAt: ts("run_at").notNull(),
  status: text("status").$type<"pending" | "running" | "done" | "canceled">().notNull().default("pending"),
  doneAt: ts("done_at"),
}, (t) => [index("events_due").on(t.status, t.runAt)]);

export type TimelineKind =
  | "you" | "sent" | "reply" | "reminder" | "booked" | "canceled" | "closed" | "info";
export const timeline = pgTable("timeline", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  at: ts("at").notNull(),
  kind: text("kind").$type<TimelineKind>().notNull(),
  text: text("text").notNull(),
  detail: text("detail"),
}, (t) => [index("timeline_job").on(t.jobId, t.at)]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  direction: text("direction").$type<"in" | "out">().notNull(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  status: text("status"),
  error: text("error"),
  jobId: integer("job_id"),
  at: ts("at").notNull(),
  processedAt: ts("processed_at"),
}, (t) => [uniqueIndex("messages_sid").on(t.twilioSid), index("messages_phone").on(t.phone, t.at)]);

export const loginCodes = pgTable("login_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  used: boolean("used").notNull().default(false),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  parentId: integer("parent_id").notNull().references(() => parents.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});
