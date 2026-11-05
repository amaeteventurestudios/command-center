import { NextResponse } from "next/server";
import { loadBoxes } from "@/lib/mail/store";
import { describe, readMessage } from "@/lib/mail/imap";

// id looks like "<mailbox id>:<in|out|spam>:<uid>", as the list returns it.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const [boxId, dir, uidText] = id.split(":");
  const uid = Number(uidText);
  if (!boxId || (dir !== "in" && dir !== "out" && dir !== "spam") || !Number.isInteger(uid) || uid < 1) {
    return NextResponse.json({ error: "Bad message id" }, { status: 400 });
  }
  const box = (await loadBoxes()).find((b) => b.id === boxId);
  if (!box) return NextResponse.json({ error: "That mailbox was removed" }, { status: 404 });
  try {
    const mail = await readMessage(box, dir, uid);
    if (!mail) return NextResponse.json({ error: "This email is no longer on the server" }, { status: 404 });
    return NextResponse.json({ mail, box: { name: box.name, user: box.user, project: box.project } });
  } catch (e) {
    return NextResponse.json({ error: describe(e) }, { status: 502 });
  }
}
