import { NextResponse } from "next/server";
import { update } from "@/lib/state";

// Follow-ups you said need no reply, by the id of the email you sent. A newer email
// to the same person makes a new follow-up, so dismissing never hides them for good.
const ID = /^[\w-]+:(out|in|spam):\d+$/; // sent mail (a follow-up) or received mail (hidden from Latest email)

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.filter((x: unknown): x is string => typeof x === "string" && ID.test(x)).slice(0, 500) : [];
  if (!ids.length) return NextResponse.json({ error: "Nothing to dismiss" }, { status: 400 });
  const s = await update((st) => {
    for (const id of ids) if (!st.dismissed.includes(id)) st.dismissed.push(id);
    if (st.dismissed.length > 5000) st.dismissed.splice(0, st.dismissed.length - 5000);
  });
  return NextResponse.json({ dismissed: s.dismissed });
}

/** Brings every dismissed follow-up back. */
export async function DELETE() {
  const s = await update((st) => { st.dismissed = []; });
  return NextResponse.json({ dismissed: s.dismissed });
}
