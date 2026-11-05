// Everything you add in the dashboard (cards, captured ideas, deadlines, projects),
// kept on the server in /data/state.json next to the mailbox list.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { perSpace, SPACE_IDS, type SpaceId } from "@/lib/config";

export interface Capture { id: string; text: string; at: string }
export interface DeadlineItem { id: string; title: string; date: string } // date: YYYY-MM-DD
export type CardColumn = "now" | "next" | "wait" | "idle" | "done";
export interface StoredCard { id: string; title: string; project: string; column: CardColumn; created: string; updated: string; url?: string; status?: string; prState?: string } // status/prState: filled from GitHub for PR links
export interface ProjectEdits { added: string[]; removed: string[] } // changes to the built-in project list
export interface SpaceState { captured: Capture[]; deadlines: DeadlineItem[]; cards: StoredCard[]; projects: ProjectEdits; noSamples?: boolean } // noSamples: you cleared the sample deadlines
export interface ServerEntry { id: string; name: string; host: string; port: number }
type State = { spaces: Record<SpaceId, SpaceState>; hidden: string[]; known: string[]; servers: ServerEntry[]; dismissed: string[]; ghGone: string[] }; // ghGone: Claude PR links you took off the board, so the GitHub watch does not add them back // dismissed: follow-ups (sent mail ids) you said need no reply // hidden: senders (a@b.com) or domains (@b.com) kept out of Email; known: new senders you chose to keep

const FILE = process.env.STATE_STORE || "/data/state.json";
const blank = (): SpaceState => ({ captured: [], deadlines: [], cards: [], projects: { added: [], removed: [] } });
const empty = (): State => ({ spaces: perSpace(blank), hidden: [], known: [], servers: [], dismissed: [], ghGone: [] });
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export async function loadState(): Promise<State> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8"));
    const s = empty();
    for (const k of SPACE_IDS) {
      const r = raw?.spaces?.[k];
      const sp = s.spaces[k];
      sp.captured = Array.isArray(r?.captured) ? r.captured : [];
      sp.deadlines = Array.isArray(r?.deadlines) ? r.deadlines : [];
      sp.cards = Array.isArray(r?.cards) ? r.cards : [];
      sp.noSamples = r?.noSamples === true;
      sp.projects = { added: strings(r?.projects?.added), removed: strings(r?.projects?.removed) };
    }
    s.known = strings(raw?.known);
    s.dismissed = strings(raw?.dismissed);
    s.ghGone = strings(raw?.ghGone);
    s.servers = Array.isArray(raw?.servers) ? raw.servers.filter((x: ServerEntry) => x && typeof x.host === "string" && typeof x.port === "number") : [];
    s.hidden = Array.isArray(raw?.hidden) ? raw.hidden.filter((x: unknown) => typeof x === "string") : [];
    return s;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw e;
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Serialises writes so two quick clicks never overwrite each other. */
export function update(fn: (s: State) => void): Promise<State> {
  const run = queue.then(async () => {
    const s = await loadState();
    fn(s);
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
    await fs.rename(tmp, FILE);
    return s;
  });
  queue = run.catch(() => {});
  return run;
}

export const newId = () => randomUUID();

export { isHidden } from "./hidden";
