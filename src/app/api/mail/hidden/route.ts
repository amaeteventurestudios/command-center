import { NextResponse } from "next/server";
import { loadState, update } from "@/lib/state";

// One sender (name@company.com) or a whole domain (@company.com). Hidden mail stays
// in the mailbox; it just stops showing in the dashboard.
const clean = (v: unknown) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return s;
  const d = s.replace(/^@/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? `@${d}` : null;
};

export async function GET() {
  return NextResponse.json({ hidden: (await loadState()).hidden });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const entry = clean(b.entry);
  if (!entry) return NextResponse.json({ error: "Give an email address or a domain like @example.com" }, { status: 400 });
  const s = await update((st) => { if (!st.hidden.includes(entry)) st.hidden.push(entry); });
  return NextResponse.json({ hidden: s.hidden });
}

export async function DELETE(req: Request) {
  const entry = clean(new URL(req.url).searchParams.get("entry"));
  const s = await update((st) => { st.hidden = st.hidden.filter((h) => h !== entry); });
  return NextResponse.json({ hidden: s.hidden });
}
