# Twilio carrier registration (A2P 10DLC): what to paste

Twilio requires an upgraded (paid) account before registration starts. After upgrading:
Console → Messaging → Regulatory Compliance → Onboarding.

Replace `YOUR-APP` with your Render address once the app is deployed (the privacy and terms pages must be live before you submit).

## Brand

- **Type:** Sole Proprietor (no EIN). Twilio texts a one-time code to the mobile number you give; reply with it.
- **Name / address / email / mobile:** yours.

## Campaign

- **Use case:** Sole Proprietor (or "Low Volume Mixed" if you register with an EIN).
- **Campaign description:**
  > Phone Tree is a private babysitter-scheduling tool used by one family (Graham & Susanna). It texts a small list of babysitters the family knows personally, after each sitter opts in, to offer specific babysitting jobs (date, time, pay), confirm bookings, send day-of reminders, and tell sitters when a job is filled or canceled. Sitters reply with 1, 2, 3, 4 or DROP. The parents also receive alerts about bookings and cancellations.
- **Message flow / how users opt in:**
  > The family invites each babysitter in person or by a personal text and asks them to text JOIN to the Phone Tree number. Nothing is sent to a sitter until they text JOIN. They immediately receive: "You're on Graham & Susanna's Phone Tree and will get job offers here. Msg frequency varies. Reply HELP for help, STOP to opt out." Phone numbers are never collected through a web form or purchased lists. Terms: https://YOUR-APP.onrender.com/terms · Privacy: https://YOUR-APP.onrender.com/privacy
- **Sample messages:**
  1. `Phone Tree: Graham & Susanna at Blessing Way have a new job: Sat Oct 31, 6:00–11:00 pm, 2 kids. Pays $26/hr. Sent to a few sitters; the first "1" gets it. 1 = I'll take it, 2 = Can't make it, 3 = Maybe. Reply STOP to opt out.`
  2. `You're booked! Sat Oct 31, 6:00–11:00 pm at Blessing Way at $26/hr. Graham & Susanna know. Reply DROP if plans change.`
  3. `Graham & Susanna's Sat 10/31, 6:00–11:00 pm job has been filled. Thanks! Reply 4 to be a backup in case plans change.`
  4. `Reminder: you're with Graham & Susanna at Blessing Way today, 6:00–11:00 pm. Reply DROP if something came up.`
- **Opt-in keywords:** JOIN, START · **Opt-in confirmation:** the JOIN reply above
- **Opt-out keywords:** STOP (Twilio's defaults) · **Opt-out message:** Twilio's default
- **Help keyword:** HELP · **Help message:**
  > Phone Tree sends job offers from Graham & Susanna. Reply 1 to take a job, 2 if you can't, 3 for maybe, 4 to be a backup, DROP to cancel a booking. Reply STOP to opt out.
- **Embedded links:** Yes (parent alerts link to the family's own Phone Tree site).
- **Embedded phone numbers:** Yes (parent alerts include a sitter's number).
- **Age-gated content / direct lending:** No.
- **Expected volume:** under 50 messages a day.

## After approval

1. Buy a local number (you pick it) and add it to the campaign's Messaging Service.
2. Number → Messaging configuration → "A message comes in": Webhook, `https://YOUR-APP.onrender.com/api/twilio/inbound`, HTTP POST.
3. In Render, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (and `TWILIO_MESSAGING_SERVICE_SID` if you send through the Messaging Service).
