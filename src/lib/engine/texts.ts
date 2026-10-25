// Every text Phone Tree sends lives here, so the wording is easy to review and change.
import { fmtDay, fmtRange, fmtShortDay, fmtTime, money, prettyPhone, local } from "@/lib/time";
import type { Household, Job } from "./context";

type J = Pick<Job, "startsAt" | "endsAt" | "kids" | "note" | "code">;

const when = (j: J, hh: Household) => `${fmtDay(j.startsAt, hh.timezone)}, ${fmtRange(j.startsAt, j.endsAt, hh.timezone)}`;
const shortWhen = (j: J, hh: Household) => `${fmtShortDay(j.startsAt, hh.timezone)}, ${fmtRange(j.startsAt, j.endsAt, hh.timezone)}`;
const codeHint = (code: string | null, show: boolean) =>
  show && code ? `\n(This is job ${code}: reply 1${code}, 2${code} or 3${code}.)` : "";

export const T = {
  offer(hh: Household, j: J, rateCents: number | null, showCode: boolean, unusualDesc?: string) {
    const lead = unusualDesc
      ? `Phone Tree: We know ${unusualDesc} aren't usually your time, but just in case: ${hh.displayName} at ${hh.houseName} need someone ${when(j, hh)}`
      : `Phone Tree: ${hh.displayName} at ${hh.houseName} have a new job: ${when(j, hh)}`;
    const kids = j.kids ? `, ${j.kids}` : "";
    const pay = rateCents != null ? ` Pays ${money(rateCents)}/hr.` : "";
    return `${lead}${kids}.${pay} Sent to a few sitters; the first "1" gets it.\n1 = I'll take it\n2 = Can't make it\n3 = Maybe${codeHint(j.code, showCode)}`;
  },
  reminder(hh: Household, j: J, showCode: boolean) {
    return `Phone Tree: Still open: ${shortWhen(j, hh)} for ${hh.displayName}. Reply 1 to take it, 2 if you can't.${codeHint(j.code, showCode)}`;
  },
  reopened(hh: Household, j: J, showCode: boolean) {
    return `Phone Tree: ${hh.displayName}'s ${shortWhen(j, hh)} job is open again. Reply 1 to take it, 2 if you can't.${codeHint(j.code, showCode)}`;
  },
  headStart(hh: Household, j: J, until: Date) {
    return `Phone Tree: ${shortWhen(j, hh)} at ${hh.houseName} just opened up, and you get first dibs until ${fmtTime(until, hh.timezone)}. After that others can claim it too, but it's still yours if you reply 1 first.`;
  },
  ackNo: () => "Got it, thanks for letting us know.",
  ackMaybe: () => "Got it, you're down as a maybe. Reply 1 anytime if it works out.",
  booked(hh: Household, j: J, rateCents: number | null) {
    const pay = rateCents != null ? ` at ${money(rateCents)}/hr` : "";
    const note = j.note ? ` Note: ${j.note}` : "";
    return `You're booked! ${when(j, hh)} at ${hh.houseName}${pay}. ${hh.displayName} know.${note} Reply DROP if plans change.`;
  },
  alreadyBooked: (hh: Household, j: J) => `You're already booked for ${shortWhen(j, hh)}. Reply DROP if you can't make it.`,
  filled: (hh: Household, j: J) =>
    `${hh.displayName}'s ${shortWhen(j, hh)} job has been filled. Thanks! Reply 4 to be a backup in case plans change.`,
  filledBackup: (hh: Household, j: J) =>
    `${hh.displayName}'s ${shortWhen(j, hh)} job has been filled again. You're still on the backup list.`,
  tooLate: (hh: Household, j: J) => `So close, someone just took it. You're on the backup list for ${fmtShortDay(j.startsAt, hh.timezone)}.`,
  backupAck: (hh: Household, j: J) =>
    `You're on the backup list for ${fmtShortDay(j.startsAt, hh.timezone)}. If it opens up, backups hear about it first.`,
  stillOpen: () => `This one's still open, so reply 1 to take it.`,
  noLonger: () => "Thanks! This job is no longer being offered.",
  dropAck: (hh: Household, j: J) => `Got it, you're off ${shortWhen(j, hh)}. Thanks for the heads-up.`,
  noBooking: () => "We couldn't find an upcoming job you're booked for.",
  noJob: () => "We couldn't find an open job for that reply. Reply HELP for help.",
  whichJob: (hh: Household, list: J[], digit: string) =>
    `You have ${list.length} jobs open: ${list.map((j) => `${j.code}: ${shortWhen(j, hh)}`).join("; ")}. Reply with the number and letter, like ${digit}${list[0].code}.`,
  dayReminder(hh: Household, j: J, now: Date) {
    const today = local(now, hh.timezone).hasSame(local(j.startsAt, hh.timezone), "day");
    const note = j.note ? ` Note: ${j.note}` : "";
    return `Reminder: you're with ${hh.displayName} at ${hh.houseName} ${today ? "today" : "tomorrow"}, ${fmtRange(j.startsAt, j.endsAt, hh.timezone)}.${note} Reply DROP if something came up.`;
  },
  canceledToBooked: (hh: Household, j: J) => `${hh.displayName} canceled their ${shortWhen(j, hh)} job, so you're no longer booked. Sorry for the change!`,
  canceledToOthers: (hh: Household, j: J) => `${hh.displayName}'s ${shortWhen(j, hh)} job has been canceled. Nothing you need to do. Thanks!`,
  closedToMaybe: (hh: Household, j: J) => `${hh.displayName}'s ${shortWhen(j, hh)} job is no longer needed. Thanks!`,
  help: (hh: Household) =>
    `Phone Tree sends job offers from ${hh.displayName}. Reply 1 to take a job, 2 if you can't, 3 for maybe, 4 to be a backup, DROP to cancel a booking. Reply STOP to opt out.`,
  joined: (hh: Household) =>
    `You're on ${hh.displayName}'s Phone Tree and will get job offers here. Msg frequency varies. Reply HELP for help, STOP to opt out.`,
  pleaseJoin: () => "Text JOIN to start getting job offers from Phone Tree.",
  passedAlong: (hh: Household) => `Passed along to ${hh.displayName}. To answer a job: 1 = take it, 2 = can't, 3 = maybe.`,
  notAdded: (hh: Household) => `Thanks! Ask ${hh.displayName} to add you to Phone Tree first.`,

  // To parents
  pBooked: (hh: Household, j: J, name: string, rateCents: number | null) =>
    `Phone Tree: ${name} booked ${shortWhen(j, hh)}${rateCents != null ? ` (${money(rateCents)}/hr)` : ""}.`,
  pDropped: (hh: Household, j: J, name: string, plan: string) =>
    `Phone Tree: ${name} canceled ${shortWhen(j, hh)}. Reopened automatically: ${plan}`,
  pClosed: (hh: Household, j: J) =>
    `Phone Tree: Nobody's claimed ${shortWhen(j, hh)}, so Phone Tree stopped offering it. Reply OPEN ${j.code} to keep trying until it starts.`,
  pForward: (name: string, phone: string, body: string) =>
    `Phone Tree: ${name} (${prettyPhone(phone)}) texted: "${body}"`,
  pOptOut: (name: string, phone: string, booked: boolean) =>
    `Phone Tree: ${name} (${prettyPhone(phone)}) unsubscribed from Phone Tree texts.${booked ? " She's still booked for an upcoming job — if she meant to cancel, reach her directly." : ""}`,
  pUnknownJoin: (phone: string) => `Phone Tree: ${prettyPhone(phone)} texted JOIN but isn't in your providers. Add them on the Providers page.`,
  pHelp: () => "Phone Tree parent commands: OPEN B (reopen closed job B).",
  pReopened: (hh: Household, j: J) => `Phone Tree: Job ${j.code} (${shortWhen(j, hh)}) is open again until it starts.`,
};
