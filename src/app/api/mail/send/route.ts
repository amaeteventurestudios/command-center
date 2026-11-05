import { NextResponse } from "next/server";
import { loadBoxes } from "@/lib/mail/store";
import { describe, forget } from "@/lib/mail/imap";
import { sendMail } from "@/lib/mail/send";

const ADDR = /^[^@\s,<>]+@[^@\s,<>]+\.[^@\s,<>]+$/;
const list = (v: unknown) => (typeof v === "string" ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : []);

// Only ever called by the Send button. Nothing is sent without the person pressing it.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const box = (await loadBoxes()).find((b) => b.id === body.boxId);
  if (!box) return NextResponse.json({ error: "Pick which mailbox to send from" }, { status: 400 });
  const to = list(body.to);
  const cc = list(body.cc);
  if (!to.length || ![...to, ...cc].every((a) => ADDR.test(a))) {
    return NextResponse.json({ error: "Check the To and Cc addresses" }, { status: 400 });
  }
  const subject = typeof body.subject === "string" ? body.subject.slice(0, 300) : "";
  const text = typeof body.text === "string" ? body.text.slice(0, 200000) : "";
  if (!subject.trim() && !text.trim()) return NextResponse.json({ error: "Write a subject or a message" }, { status: 400 });
  const header = (v: unknown) => (typeof v === "string" ? v.replace(/[\r\n]/g, " ").slice(0, 2000) : undefined);
  try {
    const result = await sendMail(box, {
      to: to.join(", "),
      cc: cc.join(", "),
      subject,
      text,
      inReplyTo: header(body.inReplyTo),
      references: header(body.references),
    });
    forget(box.id); // so the sent copy shows up on the next refresh
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: describe(e) }, { status: 502 });
  }
}
