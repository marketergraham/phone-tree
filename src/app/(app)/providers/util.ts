import { prettyPhone, money } from "@/lib/time";

export { prettyPhone, money };

export function twilioDisplay() {
  const n = process.env.TWILIO_FROM_NUMBER;
  return n ? prettyPhone(n) : "your Phone Tree number";
}
