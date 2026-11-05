"use client";

import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowUpRight, Plus, X } from "lucide-react";
import type { CardItem, Column } from "@/lib/sample-data";
import { GithubWatch } from "./github-watch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const COLUMNS: { id: Column; name: string; dot: string }[] = [
  { id: "now", name: "Now", dot: "bg-ok" },
  { id: "next", name: "Next", dot: "bg-muted-foreground" },
  { id: "wait", name: "Waiting on you", dot: "bg-accent" },
  { id: "idle", name: "Idle", dot: "bg-muted-foreground/60" },
  { id: "done", name: "Done this week", dot: "bg-muted-foreground/40" },
];
const LIMIT = 3;

export function Board({
  cards, onMove, onAdd, onRemove, sample = false, projects = [], project = null, onGithub,
}: {
  cards: CardItem[];
  onMove: (id: string, to: Column) => void;
  onAdd?: (title: string, project: string, column: Column, url?: string) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  sample?: boolean;
  projects?: string[];
  project?: string | null;
  onGithub?: () => void; // when set, shows the GitHub watch and reloads cards after it changes
}) {
  const [open, setOpen] = React.useState<Partial<Record<Column, boolean>>>({});
  const [adding, setAdding] = React.useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const onDragEnd = (e: DragEndEvent) => {
    const to = e.over?.id as Column | undefined;
    if (to) onMove(String(e.active.id), to);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {onAdd && (
        <div className="mb-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
            <p className="text-[13px] text-muted-foreground">
              {sample ? "These are sample cards. Add your first card and the samples go away." : "Your cards are saved on the server, so they stay put on every device."}
            </p>
            {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add card</Button>}
          </div>
          {adding && <AddCard projects={projects} project={project} onAdd={onAdd} onDone={() => setAdding(false)} />}
          {onGithub && <GithubWatch onChanged={onGithub} />}
        </div>
      )}
      <section aria-label="Board" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] items-start gap-4">
        {COLUMNS.map((col) => {
          const all = cards.filter((c) => c.column === col.id);
          const shown = open[col.id] ? all : all.slice(0, LIMIT);
          return (
            <DropColumn key={col.id} id={col.id}>
              <div className="flex items-center gap-2 px-1">
                <span className={cn("size-2 rounded-sm", col.dot)} aria-hidden />
                <h2 className="text-[13px] font-semibold">{col.name}</h2>
                <span className="font-mono text-xs text-muted-foreground">{all.length}</span>
              </div>
              {shown.map((c) => <DragCard key={c.id} card={c} onRemove={onRemove} />)}
              {all.length === 0 && (
                <p className="rounded-xl border border-dashed p-3.5 text-center text-[13px] text-muted-foreground">Nothing here</p>
              )}
              {all.length > LIMIT && (
                <Button variant="outline" size="sm" onClick={() => setOpen((o) => ({ ...o, [col.id]: !o[col.id] }))}>
                  {open[col.id] ? "Show less" : `Show ${all.length - LIMIT} more`}
                </Button>
              )}
            </DropColumn>
          );
        })}
      </section>
    </DndContext>
  );
}

function DropColumn({ id, children }: { id: Column; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn("flex min-w-0 flex-col gap-2.5 rounded-xl p-1 transition-colors", isOver && "bg-hover")}>
      {children}
    </div>
  );
}

function AddCard({ projects, project, onAdd, onDone }: { projects: string[]; project: string | null; onAdd: (t: string, p: string, c: Column, url?: string) => Promise<void>; onDone: () => void }) {
  const [form, setForm] = React.useState({ title: "", project: project ?? "", column: "next" as Column, url: "" });
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      await onAdd(form.title.trim(), form.project.trim(), form.column, form.url.trim() || undefined);
      setForm((f) => ({ ...f, title: "", url: "" }));
      onDone();
    } catch (err) {
      setProblem((err as Error).message);
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[2fr_1fr_1fr]">
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted-foreground">What needs doing</span>
        <Input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Send the proposal" required />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Project</span>
        <Input value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))} list="board-projects" required />
        <datalist id="board-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Column</span>
        <select value={form.column} onChange={(e) => setForm((f) => ({ ...f, column: e.target.value as Column }))} className="h-9 rounded-md border bg-muted px-3 text-sm">
          {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] sm:col-span-3">
        <span className="text-muted-foreground">Link, optional (a Claude thread, PR or doc)</span>
        <Input type="url" pattern="https://.*" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://claude.ai/…" />
      </label>
      {problem && <p role="alert" className="text-[13px] text-bad sm:col-span-3">{problem}</p>}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add card"}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

const isClaude = (u?: string) => !u || /^https:\/\/([a-z0-9-]+\.)?claude\.ai\//i.test(u);
const isPr = (u?: string) => !!u && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(u);
const host = (u?: string) => { try { return new URL(u!).hostname.replace(/^www\./, ""); } catch { return "link"; } };

function DragCard({ card, onRemove }: { card: CardItem; onRemove?: (id: string) => Promise<void> }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  return (
    <article
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      aria-roledescription="Draggable card"
      className={cn(
        "flex cursor-grab flex-col gap-2.5 rounded-xl border bg-card p-3.5 text-left transition-colors hover:border-muted-foreground/40 active:cursor-grabbing",
        isDragging && "relative z-10 shadow-lg"
      )}
    >
      {card.thread && (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge>{isClaude(card.thread.url) ? "Claude thread" : isPr(card.thread.url) ? "Pull request" : "Link"}</Badge>
          {/failing/.test(card.thread.last) && <Badge variant="bad">Checks failing</Badge>}
          {card.thread.stopped && <Badge variant="bad">Stopped</Badge>}
        </span>
      )}
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 break-words text-sm font-medium leading-snug [overflow-wrap:anywhere]">{card.title}</h3>
        {onRemove && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={() => { if (window.confirm(`Remove "${card.title}" from the board?`)) onRemove(card.id).catch(() => {}); }}
            aria-label={`Remove ${card.title}`}
            title="Remove card"
            className="-mr-1 -mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground cursor-pointer [&_svg]:size-3.5"
          >
            <X />
          </button>
        )}
      </div>
      {card.thread && (
        <>
          {card.thread.last && <p className="text-[13px] leading-snug text-muted-foreground">{card.thread.last}</p>}
          <a
            href={card.thread.url ?? "#"}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="inline-flex min-h-6 items-center gap-1 text-xs text-accent hover:underline"
          >
            {isClaude(card.thread.url) ? "Open thread in Claude" : isPr(card.thread.url) ? "Open PR on GitHub" : `Open ${host(card.thread.url)}`} <ArrowUpRight className="size-3" aria-hidden />
          </a>
        </>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span className={cn("size-1.5 shrink-0 rounded-full", card.column === "wait" ? "bg-accent" : "bg-muted-foreground/50")} aria-hidden />
          {card.project}
        </span>
        <span className="shrink-0 font-mono">{card.column === "idle" && card.age !== "today" ? `idle ${card.age}` : card.age}</span>
      </div>
    </article>
  );
}
