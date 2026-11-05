// Claude threads post their own card here. It is the one address that skips the
// dashboard login (see README.md), so it takes a secret key and nothing else:
// it can only add or update a board card, never read anything back.
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { newId, update } from "@/lib/state";
import { spaceOfProject } from "@/lib/github-watch";
import { SPACE_IDS, spaceOf } from "@/lib/config";

const COLUMNS = ["now", "next", "wait", "idle", "done"] as const;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").replace(/^Bearer\s+/i, "").trim();

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function allowed(req: Request): boolean {
  const key = clean(process.env.REPORT_TOKEN ?? "");
  const raw = req.headers.get("authorization");
  // A proxy can add its own "Bearer <key>" next to one the thread sent, so accept the key as any one word of the header.
  const words = (raw ?? "").split(/[\s,]+/).map(clean).filter(Boolean);
  const ok = key.length >= 32 && words.some((w) => same(w, key));
  // Lengths only, never the key, so a refused report can be told apart from a missing header.
  if (!ok) console.warn(`report refused: header ${raw === null ? "missing" : `present, ${(raw ?? "").length} chars, words ${words.map((w) => w.length).join("/")}`}, server key ${key.length} chars`);
  return ok;
}

/**
 * POST { space: <a space id from command.config.json>, project, title, column: now|next|wait|idle|done, url: https://claude.ai/..., last?, since? }
 * The thread link is the card's key: the first report adds the card, later ones move it and update its last line.
 */
export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 4000) return NextResponse.json({ error: "Too long" }, { status: 413 });
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ error: "Send JSON" }, { status: 400 }); }

  const project = text(b.project, 80);
  // A known Claude project always lands in its own space, even if a thread names the wrong one.
  const space = spaceOfProject(project) ?? spaceOf(b.space);
  const title = text(b.title, 300);
  const column = COLUMNS.find((c) => c === b.column);
  const url = text(b.url, 500);
  const last = text(b.last, 300);
  // since: when the thread last moved (ISO time), so an idle card can say how long it has sat.
  const sinceMs = typeof b.since === "string" ? Date.parse(b.since) : NaN;
  const since = Number.isFinite(sinceMs) && sinceMs <= Date.now() ? new Date(sinceMs).toISOString() : null;
  if (!space || !project || !title || !column || !/^https:\/\/([a-z0-9-]+\.)?claude\.ai\//i.test(url)) {
    return NextResponse.json({ error: "Need space, project, title, column and a claude.ai link" }, { status: 400 });
  }

  let created = false;
  await update((st) => {
    const now = new Date().toISOString();
    // A card filed in another space before moves here rather than being duplicated.
    for (const other of SPACE_IDS.filter((x) => x !== space)) {
      const strayAt = st.spaces[other].cards.findIndex((c) => c.url === url);
      if (strayAt >= 0) st.spaces[space].cards.unshift(...st.spaces[other].cards.splice(strayAt, 1));
    }
    const card = st.spaces[space].cards.find((c) => c.url === url);
    if (card) {
      if (card.column !== column) { card.column = column; card.updated = now; }
      if (since) card.updated = since;
      card.title = title;
      card.project = project;
      card.status = last || card.status;
    } else {
      created = true;
      st.spaces[space].cards.unshift({ id: newId(), title, project, column, created: now, updated: since ?? now, url, status: last || undefined });
    }
  });
  return NextResponse.json({ ok: true, created });
}
