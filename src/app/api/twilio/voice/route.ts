import twilio from "twilio";

export const dynamic = "force-dynamic";

/** Calls to the Phone Tree number ring through to VOICE_FORWARD_TO (e.g. Susanna's cell). */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const ok = twilio.validateRequest(token, req.headers.get("x-twilio-signature") ?? "", `${process.env.PUBLIC_URL}/api/twilio/voice`, params);
    if (!ok) return new Response("Invalid signature", { status: 403 });
  }
  const r = new twilio.twiml.VoiceResponse();
  const to = process.env.VOICE_FORWARD_TO;
  if (to) {
    // Show the caller's own number, so whoever answers knows which sitter is calling.
    r.dial({ callerId: params.From || undefined, timeout: 25 }, to);
  } else {
    r.say("Sorry, this number only handles text messages. Please text instead.");
  }
  return new Response(r.toString(), { headers: { "Content-Type": "text/xml" } });
}
