import twilio from "twilio";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export const dynamic = "force-dynamic";

/** Delivery updates for texts we sent (delivered, undelivered, failed). */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const ok = twilio.validateRequest(token, req.headers.get("x-twilio-signature") ?? "", `${process.env.PUBLIC_URL}/api/twilio/status`, params);
    if (!ok) return new Response("Invalid signature", { status: 403 });
  }
  if (params.MessageSid) {
    await getDb().update(schema.messages)
      .set({ status: params.MessageStatus, error: params.ErrorCode ? `Error ${params.ErrorCode}` : null })
      .where(eq(schema.messages.twilioSid, params.MessageSid));
  }
  return new Response("ok");
}
