import twilio from "twilio";

export type SendResult = { sid: string | null; status: string; error?: string };

export function smsDriver(): "twilio" | "fake" {
  return process.env.SMS_DRIVER === "twilio" ? "twilio" : "fake";
}

let client: ReturnType<typeof twilio> | null = null;
export function twilioClient() {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
    client = twilio(sid, token);
  }
  return client;
}

export function twilioNumber() {
  return process.env.TWILIO_FROM_NUMBER ?? "";
}

/** Send one text. In fake mode nothing leaves the server; the simulator page shows it. */
export async function deliver(to: string, body: string): Promise<SendResult> {
  if (smsDriver() === "fake") {
    return { sid: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: "simulated" };
  }
  try {
    const params: { to: string; body: string; from?: string; messagingServiceSid?: string; statusCallback?: string } = { to, body };
    if (process.env.TWILIO_MESSAGING_SERVICE_SID) params.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    else params.from = twilioNumber();
    if (process.env.PUBLIC_URL?.startsWith("https://")) params.statusCallback = `${process.env.PUBLIC_URL}/api/twilio/status`;
    const m = await twilioClient().messages.create(params);
    return { sid: m.sid, status: m.status };
  } catch (e) {
    return { sid: null, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
