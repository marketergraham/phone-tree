import twilio from "twilio";
import { getDb } from "@/db";
import { loadCtx } from "@/lib/engine/context";
import { receive } from "@/lib/engine/inbound";
import { serial } from "@/lib/engine/scheduler";

export const dynamic = "force-dynamic";

const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio calls this for every text sent to the Phone Tree number. */
export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    const url = `${process.env.PUBLIC_URL}/api/twilio/inbound`;
    const ok = twilio.validateRequest(token, req.headers.get("x-twilio-signature") ?? "", url, params);
    if (!ok) return new Response("Invalid signature", { status: 403 });
  }

  const from = params.From;
  const body = params.Body ?? "";
  if (from) {
    // Answer Twilio right away; the text is stored first, so nothing is lost if processing is slow.
    void serial(async () => receive(await loadCtx(getDb()), from, body, params.MessageSid ?? null))
      .catch((e) => console.error("inbound failed", e));
  }
  return new Response(EMPTY, { headers: { "Content-Type": "text/xml" } });
}
