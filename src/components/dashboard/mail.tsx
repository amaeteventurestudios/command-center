"use client";

import * as React from "react";
import { Inbox, PenSquare } from "lucide-react";
import type { Mail } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpaceId } from "@/lib/config";
import { Reader } from "./reader";
import { Composer, type Draft } from "./composer";
import { Mailboxes, type BoxError, type BoxInfo } from "./mailboxes";

type Dir = "all" | "in" | "out";

export function MailView({
  mails, filtered, byProject = false, initialOpen = null, onOpened, live = false, space, spaceTitle, projects: knownProjects, boxes, errors, loading, onBoxesChanged, hidden = [], hiddenCount = 0, known = [],
}: {
  mails: Mail[]; filtered: number; byProject?: boolean; initialOpen?: string | null; onOpened?: () => void; live?: boolean;
  space: SpaceId; spaceTitle: string; projects: string[]; boxes: BoxInfo[]; errors: BoxError[]; loading: boolean; onBoxesChanged: () => void; hidden?: string[]; hiddenCount?: number; known?: string[];
}) {
  const [dir, setDir] = React.useState<Dir>("all");
  const [manage, setManage] = React.useState(false);
  const [open, setOpen] = React.useState<string | null>(initialOpen);
  React.useEffect(() => { if (initialOpen) onOpened?.(); }, [initialOpen, onOpened]);
  const close = React.useCallback(() => setOpen(null), []);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const closeDraft = React.useCallback(() => setDraft(null), []);
  const [proj, setProj] = React.useState<string | null>(null);
  const projects = React.useMemo(() => {
    const m = new Map<string, { n: number; unread: number }>();
    for (const x of mails) {
      const e = m.get(x.project) ?? { n: 0, unread: 0 };
      e.n++; if (x.unread) e.unread++;
      m.set(x.project, e);
    }
    return [...m.entries()].sort((a, b) => b[1].unread - a[1].unread || b[1].n - a[1].n);
  }, [mails]);
  const active = byProject && proj && projects.some(([p]) => p === proj) ? proj : null;
  // People who wrote in and you have not written to, kept, or hidden yet.
  const newPeople = React.useMemo(() => {
    if (!live) return [];
    const ok = new Set(known);
    for (const m of mails) if (m.dir === "out" && m.address) ok.add(m.address.toLowerCase());
    const seen = new Map<string, Mail>();
    for (const m of mails) {
      const a = m.address?.toLowerCase();
      if (m.dir === "in" && a && !ok.has(a) && !seen.has(a)) seen.set(a, m);
    }
    return [...seen.values()];
  }, [live, mails, known]);
  const spamCount = mails.filter((m) => m.spam).length;
  const list = mails.filter((m) => (dir === "all" || m.dir === dir) && (!active || m.project === active));
  return (
    <section aria-label="Email" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-between">
        <div role="group" aria-label="Direction" className="flex gap-1.5">
          {([["all", "All"], ["in", "Incoming"], ["out", "Sent"]] as [Dir, string][]).map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={dir === id}
              onClick={() => setDir(id)}
              className={cn(
                "h-8 rounded-full border px-3.5 text-[13px] font-medium transition-colors cursor-pointer",
                dir === id ? "border-accent bg-accent text-accent-foreground" : "hover:bg-hover"
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" aria-expanded={manage} onClick={() => setManage((m) => !m)}>
            <Inbox /> Mailboxes <span className="font-mono text-xs text-muted-foreground">{boxes.length}</span>
          </Button>
          <Button
            onClick={() => setDraft({})}
            disabled={!live || boxes.length === 0}
            title={live && boxes.length ? undefined : "Add a mailbox first"}
          ><PenSquare /> Write email</Button>
        </div>
      </div>
      {manage && (
        <Mailboxes space={space} spaceTitle={spaceTitle} projects={knownProjects} boxes={boxes} errors={errors} hidden={hidden} onChanged={onBoxesChanged} onClose={() => setManage(false)} />
      )}
      {!manage && errors.length > 0 && (
        <p className="text-center text-[13px] text-bad">
          {errors.length === 1 ? `${errors[0].name}: ${errors[0].error}.` : `${errors.length} mailboxes could not be read.`}{" "}
          <button type="button" className="underline cursor-pointer" onClick={() => setManage(true)}>Open mailboxes</button>
        </p>
      )}
      {byProject && projects.length > 1 && (
        <div role="group" aria-label="Project" className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
          {[["", { n: mails.length, unread: mails.filter((m) => m.unread).length }] as const, ...projects].map(([p, c]) => {
            const on = (active ?? "") === p;
            return (
              <button
                key={p || "all"}
                type="button"
                aria-pressed={on}
                onClick={() => setProj(p || null)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg border px-3 text-[13px] transition-colors cursor-pointer",
                  on ? "border-accent-line bg-accent-soft text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground"
                )}
              >
                {p || "All projects"}
                <span className={cn("font-mono text-[11px]", c.unread ? "text-accent" : "text-muted-foreground")}>{c.unread ? `${c.unread} new` : c.n}</span>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-center text-[13px] text-muted-foreground">
        {live
          ? <>People only. {filtered} automated emails in the last day (GitHub, receipts, newsletters, no-reply) stayed in your mail app{hiddenCount ? `, and ${hiddenCount} from senders you hid` : ""}.</>
          : loading
            ? <>Checking for your mailboxes…</>
            : <>No mailbox connected yet. Click <strong className="font-medium text-foreground">Mailboxes</strong> and then <strong className="font-medium text-foreground">Add mailbox</strong> to connect your own.</>}
      </p>
      {!manage && live && spamCount > 0 && (
        <p role="status" className="rounded-lg border border-bad/40 px-4 py-2.5 text-center text-[13px]">
          {spamCount === 1 ? "1 reply from someone you emailed landed in Spam." : `${spamCount} replies from people you emailed landed in Spam.`}{" "}
          <span className="text-muted-foreground">They are marked SPAM below; open one to move it back to your Inbox.</span>
        </p>
      )}
      {!manage && newPeople.length > 0 && <NewPeople people={newPeople} onOpen={setOpen} onChanged={onBoxesChanged} />}
      <div className="overflow-hidden rounded-xl border">
        {list.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpen(m.id)}
            disabled={!live}
            title={live ? undefined : "Sample email, add a mailbox to open real ones"}
            className="flex w-full flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t px-4 py-3.5 text-left first:border-t-0 transition-colors hover:bg-hover cursor-pointer disabled:cursor-default"
          >
            <span className={cn("w-8 font-mono text-[11px]", m.spam ? "text-bad" : m.dir === "in" ? "text-accent" : "text-muted-foreground")} title={m.spam ? "A reply that landed in your Spam folder" : undefined}>{m.spam ? "SPAM" : m.dir === "in" ? "IN" : "OUT"}</span>
            <span className={cn("size-2 rounded-full", m.unread ? "bg-accent" : "bg-transparent")} aria-label={m.unread ? "Unread" : undefined} />
            <span className={cn("min-w-28 flex-[0_1_200px] truncate", m.unread && "font-semibold")}>{m.who}</span>
            <span className="min-w-0 flex-[1_1_260px] truncate text-foreground/85">{m.subject}</span>
            <span className="text-xs text-muted-foreground">{m.project}</span>
            <span className="w-[4.5rem] whitespace-nowrap text-right font-mono text-xs text-muted-foreground">{m.time}</span>
          </button>
        ))}
        {list.length === 0 && <p className="p-5 text-center text-muted-foreground">No email here yet</p>}
      </div>
      {open && <Reader id={open} onClose={close} onReply={(d) => { setOpen(null); setDraft(d); }} onHidden={() => { setOpen(null); onBoxesChanged(); }} onMoved={onBoxesChanged} />}
      {draft && <Composer boxes={boxes} draft={draft} onClose={closeDraft} onSent={onBoxesChanged} />}
    </section>
  );
}

function NewPeople({ people, onOpen, onChanged }: { people: Mail[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [all, setAll] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const shown = all ? people : people.slice(0, 3);
  const act = async (m: Mail, kind: "keep" | "ignore") => {
    const a = m.address!.toLowerCase();
    if (kind === "ignore" && !window.confirm(`Hide email from ${a}? It stays in your mailbox, and you can undo this under Mailboxes.`)) return;
    setBusy(a);
    try {
      await fetch(kind === "keep" ? "/api/mail/known" : "/api/mail/hidden", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(kind === "keep" ? { address: a } : { entry: a }),
      });
      onChanged();
    } finally { setBusy(null); }
  };
  return (
    <section aria-label="New people" className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5 border-b px-4 py-3 text-center sm:justify-start sm:text-left">
        <h3 className="text-[13px] font-semibold">New people <span className="font-mono text-xs font-normal text-accent">{people.length}</span></h3>
        <span className="text-xs text-muted-foreground">Wrote to you and you have not written back. Keep them, or hide them from here.</span>
      </div>
      {shown.map((m) => {
        const a = m.address!.toLowerCase();
        return (
          <div key={a} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 last:border-b-0">
            <button type="button" onClick={() => onOpen(m.id)} className="flex min-w-0 flex-[1_1_260px] flex-col text-left cursor-pointer hover:underline-offset-4 [&:hover_.s]:underline">
              <span className="truncate text-sm font-medium">{m.who} <span className="font-mono text-xs font-normal text-muted-foreground">{a}</span></span>
              <span className="truncate text-[13px] text-muted-foreground"><span className="s">{m.subject}</span> <span className="text-xs">in {m.project}</span></span>
            </button>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={busy === a} onClick={() => act(m, "keep")}>Keep</Button>
              <Button size="sm" variant="ghost" disabled={busy === a} onClick={() => act(m, "ignore")}>Hide</Button>
            </div>
          </div>
        );
      })}
      {people.length > 3 && (
        <button type="button" onClick={() => setAll((x) => !x)} className="w-full border-t px-4 py-2 text-center text-xs text-muted-foreground hover:bg-hover cursor-pointer">
          {all ? "Show fewer" : `Show ${people.length - 3} more`}
        </button>
      )}
    </section>
  );
}
