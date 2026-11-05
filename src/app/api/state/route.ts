import { NextResponse } from "next/server";
import { loadState, newId, update, type SpaceState } from "@/lib/state";
import { isPrUrl, prLine, prStatus } from "@/lib/github";
import { claudePrs, placeOf, repoOf, spaceOfProject } from "@/lib/github-watch";
import { perSpace, SPACE_IDS, spaceOf, type SpaceId } from "@/lib/config";

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function GET(req: Request) {
  const space = spaceOf(new URL(req.url).searchParams.get("space"));
  if (!space) return NextResponse.json({ error: "Bad workspace" }, { status: 400 });
  await fixSpaces();
  const st = await watchGithub(space);
  return NextResponse.json(await syncPrs(space, st));
}

/** Thread cards filed in the wrong space for their Claude project move to the right one. */
async function fixSpaces() {
  const all = await loadState();
  const stray = SPACE_IDS.some((s) => all.spaces[s].cards.some((c) => !repoOf(c.url) && (spaceOfProject(c.project) ?? s) !== s));
  if (!stray) return;
  await update((st) => {
    for (const s of SPACE_IDS) {
      const keep = [];
      for (const c of st.spaces[s].cards) {
        const home = repoOf(c.url) ? s : spaceOfProject(c.project) ?? s;
        if (home === s) keep.push(c); else st.spaces[home].cards.push(c);
      }
      st.spaces[s].cards = keep;
    }
  });
}

/**
 * Claude's PRs on GitHub become cards by themselves: a new open PR lands in Now,
 * one merged in the last week lands in Done. After that the card is yours: syncPrs
 * moves it to Done when it merges, and if you remove it, it stays removed.
 * PR cards always sit under the Claude project their repo belongs to (see placeOf).
 */
async function watchGithub(space: SpaceId): Promise<SpaceState> {
  const all = await loadState();
  const extra = perSpace((s) => all.spaces[s].projects.added);
  const found = (await claudePrs()).map((p) => ({ ...p, ...placeOf(p.owner, p.name, extra) }));
  const where = new Map<string, { space: SpaceId; project: string }>();
  for (const s of SPACE_IDS) for (const c of all.spaces[s].cards) if (c.url) where.set(c.url, { space: s, project: c.project });
  const gone = new Set(all.ghGone);
  const weekAgo = Date.now() - 7 * 864e5;
  const fresh = found.filter((p) => p.space === space && !where.has(p.url) && !gone.has(p.url) && (p.state === "open" || (p.state === "merged" && Date.parse(p.updated) > weekAgo)));
  // Every PR card follows its repo's Claude project, including older ones the scan no longer sees.
  const misplaced = [...where].flatMap(([url, w]) => {
    const r = repoOf(url);
    if (!r) return [];
    const to = placeOf(r.owner, r.name, extra);
    return to.space !== w.space || to.project !== w.project ? [{ url, ...to }] : [];
  });
  if (!fresh.length && !misplaced.length) return all.spaces[space];
  const next = await update((st) => {
    const now = new Date().toISOString();
    for (const p of misplaced) {
      for (const s of SPACE_IDS) {
        const i = st.spaces[s].cards.findIndex((c) => c.url === p.url);
        if (i < 0) continue;
        const [card] = st.spaces[s].cards.splice(i, 1);
        st.spaces[p.space].cards.push({ ...card, project: p.project });
      }
    }
    for (const p of fresh) {
      if (st.spaces[space].cards.some((c) => c.url === p.url)) continue;
      st.spaces[space].cards.unshift({ id: newId(), title: p.title.slice(0, 300), project: p.project, column: p.state === "merged" ? "done" : "now", created: now, updated: p.updated, url: p.url, prState: p.state });
    }
  });
  return next.spaces[space];
}

/**
 * Cards with a GitHub PR link pick up the PR's state. When a PR is merged or closed
 * the card moves to Done once; if you drag it back, it stays where you put it.
 */
async function syncPrs(space: SpaceId, st: SpaceState): Promise<SpaceState> {
  const prCards = st.cards.filter((c) => isPrUrl(c.url));
  if (!prCards.length) return st;
  const found = await Promise.all(prCards.map(async (c) => [c.id, await prStatus(c.url!)] as const));
  const changes = found.filter(([id, s]) => {
    const c = st.cards.find((x) => x.id === id)!;
    return s && (c.prState !== s.state || c.status !== prLine(s));
  });
  if (!changes.length) return st;
  const next = await update((all) => {
    for (const [id, s] of changes) {
      const c = all.spaces[space].cards.find((x) => x.id === id);
      if (!c || !s) continue;
      if (c.prState !== s.state && (s.state === "merged" || s.state === "closed") && c.column !== "done") {
        c.column = "done";
        c.updated = new Date().toISOString();
      }
      c.prState = s.state;
      c.status = prLine(s);
    }
  });
  return next.spaces[space];
}

const COLUMNS = ["now", "next", "wait", "idle", "done"] as const;
type Col = (typeof COLUMNS)[number];
const columnOf = (v: unknown): Col | null => (COLUMNS as readonly string[]).includes(v as string) ? (v as Col) : null;
const urlOf = (v: unknown) => { const u = text(v, 500); return /^https:\/\//.test(u) ? u : undefined; };

// { space, action: "capture" | "uncapture" | "deadline" | "undeadline" | "card" | "movecard" | "uncard" | "project" | "unproject", ... }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const space = spaceOf(b.space);
  if (!space) return NextResponse.json({ error: "Bad workspace" }, { status: 400 });
  const id = text(b.id, 64);
  switch (b.action) {
    case "capture": {
      const t = text(b.text, 500);
      if (!t) return NextResponse.json({ error: "Empty" }, { status: 400 });
      const s = await update((st) => { st.spaces[space].captured.unshift({ id: newId(), text: t, at: new Date().toISOString() }); });
      return NextResponse.json(s.spaces[space]);
    }
    case "uncapture": {
      const s = await update((st) => { st.spaces[space].captured = st.spaces[space].captured.filter((c) => c.id !== id); });
      return NextResponse.json(s.spaces[space]);
    }
    case "deadline": {
      const title = text(b.title, 200);
      const date = text(b.date, 10);
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Give it a name and a date" }, { status: 400 });
      const s = await update((st) => {
        st.spaces[space].deadlines.push({ id: newId(), title, date });
        st.spaces[space].deadlines.sort((a, z) => a.date.localeCompare(z.date));
      });
      return NextResponse.json(s.spaces[space]);
    }
    case "undeadline": {
      const s = await update((st) => { st.spaces[space].deadlines = st.spaces[space].deadlines.filter((d) => d.id !== id); });
      return NextResponse.json(s.spaces[space]);
    }
    case "card": {
      const title = text(b.title, 300);
      const project = text(b.project, 80);
      const column = columnOf(b.column) ?? "next";
      if (!title || !project) return NextResponse.json({ error: "Give the card a title and a project" }, { status: 400 });
      const now = new Date().toISOString();
      const s = await update((st) => { st.spaces[space].cards.unshift({ id: newId(), title, project, column, created: now, updated: now, url: urlOf(b.url) }); });
      return NextResponse.json(s.spaces[space]);
    }
    case "movecard": {
      const column = columnOf(b.column);
      if (!column) return NextResponse.json({ error: "Bad column" }, { status: 400 });
      const s = await update((st) => {
        const c = st.spaces[space].cards.find((x) => x.id === id);
        if (c && c.column !== column) { c.column = column; c.updated = new Date().toISOString(); }
      });
      return NextResponse.json(s.spaces[space]);
    }
    case "project": {
      const name = text(b.name, 60);
      if (!name) return NextResponse.json({ error: "Give the project a name" }, { status: 400 });
      const same = (x: string) => x.toLowerCase() === name.toLowerCase();
      const s = await update((st) => {
        const pr = st.spaces[space].projects;
        const wasRemoved = pr.removed.some(same);
        pr.removed = pr.removed.filter((x) => !same(x));
        if (!wasRemoved && !pr.added.some(same)) pr.added.push(name);
      });
      return NextResponse.json(s.spaces[space]);
    }
    case "unproject": {
      const name = text(b.name, 60);
      const same = (x: string) => x.toLowerCase() === name.toLowerCase();
      const s = await update((st) => {
        const pr = st.spaces[space].projects;
        if (pr.added.some(same)) pr.added = pr.added.filter((x) => !same(x));
        else if (name && !pr.removed.some(same)) pr.removed.push(name);
      });
      return NextResponse.json(s.spaces[space]);
    }
    case "nosamples": {
      const s = await update((st) => { st.spaces[space].noSamples = true; });
      return NextResponse.json(s.spaces[space]);
    }
    case "uncard": {
      const s = await update((st) => {
        const gone = st.spaces[space].cards.find((c) => c.id === id);
        if (gone?.url && isPrUrl(gone.url) && !st.ghGone.includes(gone.url)) st.ghGone = [...st.ghGone, gone.url].slice(-500);
        st.spaces[space].cards = st.spaces[space].cards.filter((c) => c.id !== id);
      });
      return NextResponse.json(s.spaces[space]);
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
