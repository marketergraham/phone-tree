# Phone Tree

Book sitters by text. Parents create a job on the web; Phone Tree texts sitters tier by tier, takes the first reply of "1", tells everyone else, keeps a backup list, and reopens the job automatically if the sitter cancels. Sitters never need an app.

## What's in this version

- **Jobs**: one-time jobs with tiers, wait times between tiers, each sitter's own rate (or a job rate), kids and a note.
- **Availability**: weekly grid (early morning → late evening) per sitter, plus away dates. Sitters who aren't usually free can be skipped, asked at the end, or included from the start.
- **Texting rules**: texting hours (default 8 am–10 pm; jobs within 12 hours ignore them), reminders every N hours up to a limit, stop offering N hours before the job and alert parents.
- **Replies**: `1` take it · `2` can't · `3` maybe · `4` backup · `DROP` cancel a booking · `HELP` · `JOIN` · `STOP`. When a sitter has two open offers, texts include a job letter (`1B`).
- **Booking**: first `1` wins (one atomic database update), confirmation + "job filled" texts, parents alerted, day-of reminder (9 am, or 7 pm the night before for early jobs).
- **Cancellations**: no action needed from parents. Backups get a head start (60 min, shorter when the job is close), then everyone who didn't say no, then the remaining tiers continue where they left off.
- **Job page timeline**: every text, reply and automatic step, a "Now" marker, and every planned step ahead.
- **Parent alerts by text** to everyone in Settings → Parents. Parents can reply `OPEN B` to reopen a closed job.
- **Reliability**: an every-30-second scheduler inside the app, plus a check against Twilio every 3 minutes that processes any incoming text the webhook missed (each text is handled once, by its Twilio ID).

Coming next: weekly jobs, Google Calendar sync, editing a job after it's sent.

## Test mode (no Twilio needed)

With `SMS_DRIVER=fake`, nothing is texted. Open **/dev** (the text simulator) to read every text Phone Tree sends, reply as any sitter or parent, and move the clock forward to watch tiers, reminders and head starts happen. Your sign-in code also shows up there. Don't run test mode on a public URL: the simulator isn't password-protected.

## Deploy on Render

1. **Twilio**
   - Buy a local number.
   - Complete US carrier registration (A2P 10DLC: brand + campaign). Use the sample texts in `src/lib/engine/texts.ts`. For opt-in, describe: "Sitters text JOIN to the number after the family invites them in person."
   - Number → Messaging configuration → "A message comes in": **Webhook**, `https://YOUR-APP.onrender.com/api/twilio/inbound`, **HTTP POST**.
2. **Render**: New → **Blueprint** → choose this repo. It creates the web service (Starter, always on) and a Postgres database. Fill in `PUBLIC_URL`, `PARENT_PHONES` and the three `TWILIO_*` values.
3. Open the app, sign in with a parent number (you'll get a code by text), add sitters on **Providers**, and ask each sitter to text **JOIN** to your Twilio number.

Note: Twilio treats `STOP`, `CANCEL`, `END`, `QUIT`, `UNSUBSCRIBE` as opt-out words and blocks further texts to that person. That's why sitters cancel a booking with **DROP**. If a booked sitter texts CANCEL, parents get an alert.

## Local development

```bash
cp .env.example .env      # point DATABASE_URL at a local Postgres
npm install
npm run migrate
npm run seed:demo         # optional: 7 sample sitters
npm run dev               # http://localhost:3000
npm test                  # engine scenarios (uses TEST_DATABASE_URL or a local phonetree_test database)
```

After changing `src/db/schema.ts`, run `npm run db:generate` to create a migration in `drizzle/`.

## Code map

- `src/lib/engine/rollout.ts`: tiers, booking, cancellations, scheduled steps
- `src/lib/engine/inbound.ts`: every incoming text
- `src/lib/engine/texts.ts`: the wording of every text
- `src/lib/engine/scheduler.ts`: the 30-second loop and Twilio catch-up
- `src/lib/views.ts`: what the job pages show, including planned steps
- `src/app/`: pages (Next.js App Router)
