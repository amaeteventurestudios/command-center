import { NextResponse } from "next/server";
import { update } from "@/lib/state";

// A first-time sender you chose to keep, so they stop showing under "New people".
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const address = typeof b.address === "string" ? b.address.trim().toLowerCase() : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return NextResponse.json({ error: "Not an email address" }, { status: 400 });
  const s = await update((st) => { if (!st.known.includes(address)) st.known.push(address); if (st.known.length > 5000) st.known.shift(); });
  return NextResponse.json({ known: s.known });
}
