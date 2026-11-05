"use client";

import * as React from "react";
import { perSpace, type SpaceId } from "@/lib/config";

export interface Capture { id: string; text: string; at: string }
export interface DeadlineItem { id: string; title: string; date: string }
export interface StoredCard { id: string; title: string; project: string; column: "now" | "next" | "wait" | "idle" | "done"; created: string; updated: string; url?: string; status?: string }
export interface ProjectEdits { added: string[]; removed: string[] }
interface Saved { captured: Capture[]; deadlines: DeadlineItem[]; cards: StoredCard[]; projects: ProjectEdits; noSamples?: boolean; ready: boolean; error?: string }

const NO_EDITS: ProjectEdits = { added: [], removed: [] };
const EMPTY: Saved = { captured: [], deadlines: [], cards: [], projects: NO_EDITS, ready: false };

/** Captured ideas and deadlines for one workspace, saved on the server. */
export function useSaved(space: SpaceId) {
  const [state, setState] = React.useState<Record<SpaceId, Saved>>(() => perSpace(() => EMPTY));

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    // Every five minutes, so cards linked to a PR pick up its latest state.
    const t = setInterval(() => setTick((n) => n + 1), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    let gone = false;
    fetch(`/api/state?space=${space}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (!gone) setState((s) => ({ ...s, [space]: { captured: d.captured, deadlines: d.deadlines, cards: d.cards ?? [], projects: d.projects ?? NO_EDITS, noSamples: d.noSamples === true, ready: true } })); })
      .catch(() => { if (!gone) setState((s) => ({ ...s, [space]: { ...s[space], ready: true, error: "Could not load saved items" } })); });
    return () => { gone = true; };
  }, [space, tick]);

  const act = React.useCallback(async (body: Record<string, string>) => {
    const r = await fetch("/api/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ space, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Could not save");
    setState((s) => ({ ...s, [space]: { captured: d.captured, deadlines: d.deadlines, cards: d.cards ?? [], projects: d.projects ?? NO_EDITS, noSamples: d.noSamples === true, ready: true } }));
  }, [space]);

  return {
    ...state[space],
    capture: (text: string) => act({ action: "capture", text }),
    uncapture: (id: string) => act({ action: "uncapture", id }),
    addDeadline: (title: string, date: string) => act({ action: "deadline", title, date }),
    removeDeadline: (id: string) => act({ action: "undeadline", id }),
    addCard: (title: string, project: string, column: string, url?: string) => act({ action: "card", title, project, column, ...(url ? { url } : {}) }),
    moveCard: (id: string, column: string) => {
      // Move it on screen straight away; the server answer then confirms it.
      setState((s) => ({ ...s, [space]: { ...s[space], cards: s[space].cards.map((c) => (c.id === id ? { ...c, column: column as StoredCard["column"], updated: new Date().toISOString() } : c)) } }));
      return act({ action: "movecard", id, column });
    },
    removeCard: (id: string) => act({ action: "uncard", id }),
    clearSamples: () => act({ action: "nosamples" }),
    addProject: (name: string) => act({ action: "project", name }),
    removeProject: (name: string) => act({ action: "unproject", name }),
    reload: () => setTick((n) => n + 1),
  };
}

export function untilText(date: string): { when: string; soon: boolean; past: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${date}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { when: `${-days}d overdue`, soon: true, past: true };
  if (days === 0) return { when: "today", soon: true, past: false };
  if (days === 1) return { when: "tomorrow", soon: true, past: false };
  return { when: `in ${days} days`, soon: days <= 7, past: false };
}

/** "today", "3d", "2w" since an ISO time. */
export function ageText(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
