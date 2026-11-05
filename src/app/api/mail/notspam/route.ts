import { NextResponse } from "next/server";
import { loadBoxes } from "@/lib/mail/store";
import { describe, moveToInbox } from "@/lib/mail/imap";

// { id: "<mailbox id>:spam:<uid>" } moves that email from Spam to the Inbox, on the mail server.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const [boxId, dir, uidText] = String(b.id ?? "").split(":");
  const uid = Number(uidText);
  if (!boxId || dir !== "spam" || !Number.isInteger(uid) || uid < 1) return NextResponse.json({ error: "Bad message id" }, { status: 400 });
  const box = (await loadBoxes()).find((x) => x.id === boxId);
  if (!box) return NextResponse.json({ error: "That mailbox was removed" }, { status: 404 });
  try {
    if (!(await moveToInbox(box, uid))) return NextResponse.json({ error: "Could not find it in Spam any more" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: describe(e) }, { status: 502 });
  }
}
