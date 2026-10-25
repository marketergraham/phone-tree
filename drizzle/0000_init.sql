CREATE TABLE "away_dates" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT 'Graham & Susanna' NOT NULL,
	"house_name" text DEFAULT 'Blessing Way' NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"texting_start_min" integer DEFAULT 480 NOT NULL,
	"texting_end_min" integer DEFAULT 1320 NOT NULL,
	"test_clock_offset_ms" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"code" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"rate_cents" integer,
	"kids" text,
	"note" text,
	"tier_waits" jsonb DEFAULT '[24,24]'::jsonb NOT NULL,
	"unavailable_mode" text DEFAULT 'end' NOT NULL,
	"unavailable_wait_hours" integer DEFAULT 12 NOT NULL,
	"remind_every_hours" integer DEFAULT 12 NOT NULL,
	"remind_max" integer DEFAULT 3 NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"allow_any_hour" boolean DEFAULT false NOT NULL,
	"close_before_hours" integer DEFAULT 6 NOT NULL,
	"head_start_minutes" integer DEFAULT 60 NOT NULL,
	"tier_sent" integer DEFAULT 0 NOT NULL,
	"unavailable_asked" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"booked_offer_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "login_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"direction" text NOT NULL,
	"phone" text NOT NULL,
	"body" text NOT NULL,
	"twilio_sid" text,
	"status" text,
	"error" text,
	"job_id" integer,
	"at" timestamp with time zone NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"provider_id" integer NOT NULL,
	"tier" integer NOT NULL,
	"rate_cents" integer,
	"outside_usual" boolean DEFAULT false NOT NULL,
	"reply" text DEFAULT 'none' NOT NULL,
	"replied_at" timestamp with time zone,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"alerts" boolean DEFAULT true NOT NULL,
	CONSTRAINT "parents_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"rate_cents" integer,
	"tier" integer DEFAULT 1 NOT NULL,
	"availability" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"joined" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone,
	"opted_out" boolean DEFAULT false NOT NULL,
	"ever_texted" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "providers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "scheduled_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "away_dates" ADD CONSTRAINT "away_dates_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_events" ADD CONSTRAINT "scheduled_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_parent_id_parents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."parents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline" ADD CONSTRAINT "timeline_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_sid" ON "messages" USING btree ("twilio_sid");--> statement-breakpoint
CREATE INDEX "messages_phone" ON "messages" USING btree ("phone","at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_job_provider" ON "offers" USING btree ("job_id","provider_id");--> statement-breakpoint
CREATE INDEX "events_due" ON "scheduled_events" USING btree ("status","run_at");--> statement-breakpoint
CREATE INDEX "timeline_job" ON "timeline" USING btree ("job_id","at");