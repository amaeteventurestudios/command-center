"use client";

import * as React from "react";
import { perSpace, type SpaceId } from "@/lib/config";
import type { Mail } from "@/lib/sample-data";
import type { BoxError, BoxInfo } from "./mailboxes";

interface LiveMail { id: string; project: string; box: string; dir: "in" | "out"; who: string; address: string; subject: string; date: string; unread: boolean }
interface State { boxes: BoxInfo[]; mails: Mail[]; automated: number; errors: BoxError[]; loading: boolean; hidden: string[]; hiddenCount: number; known: string[]; dismissed: string[] }

const EMPTY: State = { boxes: [], mails: [], automated: 0, errors: [], loading: true, hidden: [], hiddenCount: 0, known: [], dismissed: [] };

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Real mail for one workspace, refreshed every two minutes. Empty boxes = not set up yet. */
export function useLiveMail(space: SpaceId) {
  const [state, setState] = React.useState<Record<SpaceId, State>>(() => perSpace(() => EMPTY));
  const [tick, setTick] = React.useState(0);
  const reload = React.useCallback(() => setTick((t) => t + 1), []);

  React.useEffect(() => {
    let gone = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/mail?space=${space}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (gone) return;
        const mails: Mail[] = (data.mails as LiveMail[]).map((m) => ({ ...m, time: when(m.date) }));
        setState((s) => ({ ...s, [space]: { boxes: data.mailboxes, mails, automated: data.automated, errors: data.errors, loading: false, hidden: data.hidden ?? [], hiddenCount: data.hiddenCount ?? 0, known: data.known ?? [], dismissed: data.dismissed ?? [] } }));
      } catch {
        if (!gone) setState((s) => ({ ...s, [space]: { ...s[space], loading: false } }));
      }
    };
    load();
    const t = setInterval(load, 120000);
    return () => { gone = true; clearInterval(t); };
  }, [space, tick]);

  return { ...state[space], reload };
}
