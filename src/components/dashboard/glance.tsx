"use client";

import * as React from "react";
import { ArrowRight, ChevronDown, Plus, X } from "lucide-react";
import { untilText, type Capture, type DeadlineItem } from "./use-saved";
import type { CardItem, Space } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const SERVER_WARN = 90;
const SERVER_BAD = 95;
const PULSE_LIMIT = 8;

/**
 * At a glance: answers, in order, what needs me, who wrote, what is moving,
 * what is due and whether the servers are fine. Anything not yet connected to a
 * live source is labelled sample.
 */
export function Glance({
  space,
  cards,
  captured,
  deadlines,
  onUncapture,
  onAddDeadline,
  onRemoveDeadline,
  liveMail,
  openProject,
  openMail,
  go,
  onDismiss,
  onDoneCard,
  hiddenMail,
  sampleCards = false,
  noSamples = false,
  onClearSamples,
}: {
  space: Space;
  cards: CardItem[];
  captured: Capture[];
  deadlines: DeadlineItem[];
  onUncapture: (id: string) => Promise<void>;
  onAddDeadline: (title: string, date: string) => Promise<void>;
  onRemoveDeadline: (id: string) => Promise<void>;
  liveMail: boolean;
  openProject: (p: string) => void;
  openMail: (id?: string) => void;
  go: (v: "board" | "mail" | "people") => void;
  onDismiss?: (mailIds: string[]) => Promise<void>;
  onDoneCard?: (cardId: string) => void;
  hiddenMail?: Set<string>;
  sampleCards?: boolean;
  noSamples?: boolean;
  onClearSamples?: () => Promise<void>;
}) {
  const waiting = cards.filter((c) => c.column === "wait");
  const late = space.people.filter((p) => p.late);
  const needs = [
    ...waiting.map((c) => ({ id: c.id, kind: "Task" as const, title: c.title, project: c.project, mailId: undefined as string | undefined })),
    ...late.map((p) => ({ id: p.id, kind: "Reply" as const, title: `${p.next}: ${p.who}`, project: p.project, mailId: p.live?.mailId })),
  ];
  // Your own deadlines replace the sample ones as soon as you add the first.
  const ownDeadlines = deadlines.length > 0 || noSamples || space.deadlines.length === 0;
  const dueList = ownDeadlines
    ? deadlines.map((d) => ({ id: d.id, title: d.title, ...untilText(d.date) }))
    : space.deadlines.map((d) => ({ id: "", title: d.title, when: d.when, soon: d.soon, past: false }));
  const latest = space.mails.filter((m) => m.dir === "in" && !hiddenMail?.has(m.id)).slice(0, 6);
  const replyIds = needs.flatMap((n) => (n.kind === "Reply" && n.mailId ? [n.mailId] : []));
  const clearNeed = (n: (typeof needs)[number]) => {
    if (n.kind === "Reply" && n.mailId) onDismiss?.([n.mailId]);
    if (n.kind === "Task" && onDoneCard) onDoneCard(n.id);
  };
  const canClear = (n: (typeof needs)[number]) => (n.kind === "Reply" ? !!(onDismiss && n.mailId) : !!onDoneCard);
  const unread = space.mails.filter((m) => m.unread).length;
  const moving = cards.filter((c) => c.column === "now").length;
  const [health, reloadHealth] = useHealth();
  const hotServers = health
    ? [
        ...(health.self.disk >= SERVER_WARN ? [`${health.self.name} disk ${health.self.disk}%`] : []),
        ...health.servers.filter((x) => !x.up).map((x) => `${x.name} not answering`),
      ]
    : [];

  const active = space.projects.filter(
    (p) => cards.some((c) => c.project === p && c.column !== "done") || space.mails.some((m) => m.project === p)
  );

  return (
    <div className="flex flex-col gap-5">
      <Brief
        needs={needs.length}
        first={needs[0]?.title}
        moving={moving}
        unread={unread}
        late={late.length}
        deadline={dueList[0]}
        hotServers={hotServers}
        liveMail={liveMail}
        spaceTitle={space.title}
      />

      <div className="order-2 grid gap-4 lg:grid-cols-2">
        <Panel
          title={<><span className="size-2 rounded-full bg-accent" aria-hidden /> Needs you <Count n={needs.length} /></>}
          action={
            <span className="flex items-center gap-3">
              {onDismiss && replyIds.length > 1 && (
                <button type="button" onClick={() => { if (window.confirm(`Mark all ${replyIds.length} follow-ups as no reply needed? You can bring them back under People.`)) onDismiss(replyIds); }} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline cursor-pointer">
                  Dismiss all replies
                </button>
              )}
              {needs.length > 3 && <LinkButton onClick={() => go(waiting.length ? "board" : "people")}>View all {needs.length}</LinkButton>}
            </span>
          }
          sample={sampleCards && !liveMail}
        >
          {needs.slice(0, 3).map((n) => (
            <div key={n.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1 [&>button]:w-full">
                <Row onClick={() => (n.kind === "Reply" ? go("people") : openProject(n.project))}>
                  <span className={cn(
                    "w-11 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[11px] font-medium",
                    n.kind === "Task" ? "bg-accent text-accent-foreground" : "border text-muted-foreground"
                  )}>{n.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{n.project}</span>
                </Row>
              </div>
              {canClear(n) && <RemoveButton label={n.kind === "Reply" ? `No reply needed: ${n.title}` : `Mark done: ${n.title}`} onClick={() => clearNeed(n)} />}
            </div>
          ))}
          {needs.length === 0 && <Empty>Nothing needs you right now</Empty>}
        </Panel>

        <Panel
          title={<>Latest email {unread > 0 && <span className="font-mono text-xs font-normal text-accent">{unread} new</span>}</>}
          action={
            <span className="flex items-center gap-3">
              {liveMail && onDismiss && latest.length > 1 && (
                <button type="button" onClick={() => { if (window.confirm(`Dismiss these ${latest.length} emails from here? They stay in your mailbox.`)) onDismiss(latest.map((m) => m.id)); }} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline cursor-pointer">
                  Dismiss all
                </button>
              )}
              <LinkButton onClick={() => openMail()}>All email</LinkButton>
            </span>
          }
          sample={!liveMail && space.mails.length > 0}
        >
          {latest.map((m) => (
            <div key={m.id} className="flex items-center gap-1">
            <div className="min-w-0 flex-1 [&>button]:w-full">
            <Row onClick={() => openMail(liveMail ? m.id : undefined)} title={`${m.who}: ${m.subject}`}>
              <span className={cn("size-1.5 shrink-0 rounded-full", m.unread ? "bg-accent" : "bg-transparent")} aria-label={m.unread ? "Unread" : undefined} />
              <span className="grid min-w-0 flex-1 gap-x-4 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
                <span className={cn("truncate", m.unread ? "font-semibold" : "text-foreground/80")}>{m.who}{m.spam && <span className="ml-1.5 font-mono text-[11px] font-normal text-bad">in Spam</span>}</span>
                <span className={cn("truncate text-[13px] sm:text-sm", m.unread ? "text-foreground" : "text-muted-foreground")}>{m.subject}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{m.time}</span>
            </Row>
            </div>
            {liveMail && onDismiss && <RemoveButton label={`Dismiss from here: ${m.who}, ${m.subject}`} onClick={() => onDismiss([m.id])} />}
            </div>
          ))}
          {latest.length === 0 && <Empty>{liveMail ? "No email from people yet" : "Add a mailbox under Email to see your mail here"}</Empty>}
        </Panel>
      </div>

      <div className="order-3 grid gap-4 md:grid-cols-2 lg:order-4 xl:grid-cols-3">
        <Deadlines list={dueList} sample={!ownDeadlines} onAdd={onAddDeadline} onRemove={onRemoveDeadline} onClearSamples={onClearSamples} />

        <ServersPanel health={health} onChanged={reloadHealth} className="md:order-last md:col-span-2 xl:order-none xl:col-span-1" />

        <Panel title="Follow-ups and captured">
          {late.map((p) => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="min-w-0 flex-1 [&>button]:w-full">
                <Row onClick={() => go("people")}>
                  <span className="w-11 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground">Reply</span>
                  <span className="min-w-0 flex-1 truncate">{p.who}</span>
                  <span className="shrink-0 font-mono text-xs text-accent">{p.due}</span>
                </Row>
              </div>
              {onDismiss && p.live && <RemoveButton label={`No reply needed: ${p.who}`} onClick={() => onDismiss([p.live!.mailId])} />}
            </div>
          ))}
          {captured.map((c) => (
            <div key={c.id} className="group flex items-center gap-3 border-t py-2">
              <span className="w-11 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground">Idea</span>
              <span className="min-w-0 flex-1 truncate" title={c.text}>{c.text}</span>
              <RemoveButton label={`Remove idea: ${c.text}`} onClick={() => onUncapture(c.id)} />
            </div>
          ))}
          {late.length + captured.length === 0 && <Empty>No follow-ups due and nothing to sort</Empty>}
        </Panel>
      </div>

      <Pulse className="order-4 lg:order-3" space={space} cards={cards} active={active} openProject={openProject} />
    </div>
  );
}

function Brief({
  needs, first, moving, unread, late, deadline, hotServers, liveMail, spaceTitle,
}: {
  needs: number; first?: string; moving: number; unread: number; late: number;
  deadline?: { title: string; when: string }; hotServers: string[]; liveMail: boolean; spaceTitle: string;
}) {
  const [open, setOpen] = React.useState(false);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <section aria-label="Morning brief" className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left cursor-pointer sm:items-center"
      >
        <span className="shrink-0 font-mono text-xs font-medium text-accent sm:pt-0">Brief</span>
        <span className="min-w-0 flex-1 text-[14px] leading-relaxed">
          {plural(needs, "thing needs", "things need")} you in {spaceTitle}{first ? `, first: ${first}` : ""}.{" "}
          {plural(unread, "unread email", "unread emails")} from people, {plural(late, "follow-up", "follow-ups")} overdue
          {deadline ? `, ${deadline.title} ${deadline.when}` : ""}.
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform sm:mt-0", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 border-t px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
          <p>{plural(moving, "item is", "items are")} moving on the board. {hotServers.length ? `Servers to watch: ${hotServers.join(", ")}.` : "All servers are within limits."}</p>
          <p>
            Live: your board, deadlines and servers{liveMail ? ", plus email and follow-ups" : ""}.
            {liveMail ? "" : " Add a mailbox under Email to bring in mail and follow-ups."}
          </p>
        </div>
      )}
    </section>
  );
}

function Pulse({ className, space, cards, active, openProject }: { className?: string; space: Space; cards: CardItem[]; active: string[]; openProject: (p: string) => void }) {
  const [all, setAll] = React.useState(false);
  const list = all ? active : active.slice(0, PULSE_LIMIT);
  return (
    <section aria-labelledby="pulse-h" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 id="pulse-h" className="text-[15px] font-semibold">Project pulse</h2>
          <p className="text-[13px] text-muted-foreground">What each active project is doing now. {space.cards.length > 0 && <SampleTag />}</p>
        </div>
        {active.length > PULSE_LIMIT && <LinkButton onClick={() => setAll((a) => !a)}>{all ? "Show fewer" : `View all ${active.length}`}</LinkButton>}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((p, i) => {
          const now = cards.find((c) => c.project === p && c.column === "now") ?? cards.find((c) => c.project === p && c.column === "next");
          const stalled = cards.some((c) => c.project === p && c.thread?.stopped);
          const waiting = cards.some((c) => c.project === p && c.column === "wait");
          const due = space.people.some((x) => x.project === p && x.late);
          const alert = stalled ? "Stalled" : waiting ? "Needs you" : due ? "Follow-up due" : null;
          return (
            <button
              key={p}
              type="button"
              onClick={() => openProject(p)}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-lg border bg-card px-3.5 py-3 text-left transition-colors hover:border-muted-foreground/40 cursor-pointer",
                !all && i >= 4 && "hidden sm:flex"
              )}
            >
              <span className="flex w-full items-center gap-2">
                <span className={cn("size-1.5 shrink-0 rounded-full", alert ? "bg-accent" : now ? "bg-ok" : "bg-muted-foreground/50")} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{p}</span>
                {alert && <span className={cn("shrink-0 text-[11px]", stalled ? "text-bad" : "text-accent")}>{alert}</span>}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">{now ? now.title : "Nothing moving"}</span>
            </button>
          );
        })}
      </div>
      {!all && list.length > 4 && (
        <button type="button" onClick={() => setAll(true)} className="text-[13px] text-muted-foreground underline underline-offset-4 sm:hidden cursor-pointer">
          Show {active.length - 4} more projects
        </button>
      )}
      {active.length === 0 && <p className="text-center text-muted-foreground">No active projects yet</p>}
    </section>
  );
}

function Panel({
  title, action, sample, className, children,
}: { title: React.ReactNode; action?: React.ReactNode; sample?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card px-4 pb-1.5 pt-3", className)}>
      <div className="flex items-center justify-between gap-3 pb-2">
        <h2 className="flex items-center gap-2 text-[14px] font-semibold">
          {title}
          {sample && <SampleTag />}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ onClick, title, children }: { onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className="-mx-2 flex items-center gap-3 rounded-md border-t border-t-border px-2 py-2 text-left transition-colors first-of-type:border-t hover:bg-hover cursor-pointer">
      {children}
    </button>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex shrink-0 items-center gap-1 text-xs text-accent underline-offset-4 hover:underline cursor-pointer">
      {children} <ArrowRight className="size-3" aria-hidden />
    </button>
  );
}

const Count = ({ n }: { n: number }) => <span className="font-mono text-xs font-normal text-muted-foreground">{n}</span>;
const SampleTag = () => <span className="rounded border px-1 py-px font-mono text-[10px] font-normal text-muted-foreground">sample</span>;
const Empty = ({ children }: { children: React.ReactNode }) => <p className="border-t py-4 text-center text-[13px] text-muted-foreground">{children}</p>;

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Remove"
      className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-hover hover:text-foreground hover:opacity-100 focus-visible:opacity-100 cursor-pointer [&_svg]:size-3.5"
    >
      <X />
    </button>
  );
}

function Deadlines({
  list, sample, onAdd, onRemove, onClearSamples,
}: {
  list: { id: string; title: string; when: string; soon: boolean; past: boolean }[];
  sample: boolean;
  onAdd: (title: string, date: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onClearSamples?: () => Promise<void>;
}) {
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [date, setDate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try { await onAdd(title, date); setTitle(""); setDate(""); setAdding(false); }
    catch (err) { setError((err as Error).message); }
  };
  return (
    <Panel
      title="Deadlines and renewals"
      sample={sample}
      action={!adding ? (
        <button type="button" onClick={() => setAdding(true)} aria-label="Add deadline" className="flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline cursor-pointer">
          <Plus className="size-3" aria-hidden /> Add
        </button>
      ) : null}
    >
      {adding && (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2 border-t py-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is due" aria-label="What is due" required autoFocus
            className="h-8 min-w-0 flex-[1_1_9rem] rounded-md border bg-muted px-2.5 text-sm outline-none" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Due date" required
            className="h-8 rounded-md border bg-muted px-2 text-sm outline-none [color-scheme:inherit]" />
          <button type="submit" className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground cursor-pointer">Save</button>
          <button type="button" onClick={() => { setAdding(false); setError(null); }} className="h-8 px-2 text-xs text-muted-foreground cursor-pointer">Cancel</button>
          {error && <p role="alert" className="w-full text-xs text-bad">{error}</p>}
        </form>
      )}
      {list.map((d, i) => (
        <div key={d.id || `${d.title}-${i}`} className="flex items-center justify-between gap-3 border-t py-2">
          <span className="min-w-0 flex-1 truncate">{d.title}</span>
          <span className={cn("shrink-0 font-mono text-xs", d.past ? "text-bad" : d.soon ? "text-accent" : "text-muted-foreground")}>{d.when}</span>
          {d.id ? <RemoveButton label={`Remove deadline: ${d.title}`} onClick={() => onRemove(d.id)} /> : onClearSamples && <RemoveButton label={`Clear sample deadlines`} onClick={() => onClearSamples()} />}
        </div>
      ))}
      {list.length === 0 && <Empty>Nothing due soon</Empty>}
      {sample && !adding && (
        <p className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-xs text-muted-foreground">
          Add your first deadline and these samples go away.
          {onClearSamples && <button type="button" onClick={() => onClearSamples()} className="underline-offset-4 hover:text-foreground hover:underline cursor-pointer">Clear samples</button>}
        </p>
      )}
    </Panel>
  );
}

interface Health {
  self: { name: string; disk: number; mem: number; load: number; cores: number };
  servers: { id: string; name: string; host: string; port: number; up: boolean; ms: number | null }[];
}

/** Live server health, refreshed every minute. */
function useHealth(): [Health | null, () => void] {
  const [health, setHealth] = React.useState<Health | null>(null);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    let gone = false;
    const load = () => fetch("/api/servers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!gone && d) setHealth(d); })
      .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { gone = true; clearInterval(t); };
  }, [tick]);
  return [health, React.useCallback(() => setTick((n) => n + 1), [])];
}

const level = (n: number) => (n >= SERVER_BAD ? "bad" : n >= SERVER_WARN ? "warn" : "ok");
const dot = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" } as const;
const ink = { ok: "text-muted-foreground", warn: "text-warn", bad: "text-bad" } as const;

function ServersPanel({ health, onChanged, className }: { health: Health | null; onChanged: () => void; className?: string }) {
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", host: "", port: "22" });
  const [error, setError] = React.useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? "Could not add"); return; }
    setForm({ name: "", host: "", port: "22" }); setAdding(false); onChanged();
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Stop checking ${name}?`)) return;
    await fetch(`/api/servers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    onChanged();
  };
  const field = "h-8 min-w-0 rounded-md border bg-muted px-2.5 text-sm outline-none";
  const self = health?.self;
  const worst = self ? level(Math.max(self.disk, self.mem)) : "ok";
  return (
    <Panel
      title="Servers"
      className={className}
      action={!adding ? (
        <button type="button" onClick={() => setAdding(true)} aria-label="Add server" className="flex items-center gap-1 text-xs text-accent underline-offset-4 hover:underline cursor-pointer">
          <Plus className="size-3" aria-hidden /> Add
        </button>
      ) : null}
    >
      {adding && (
        <form onSubmit={save} className="flex flex-wrap items-center gap-2 border-t py-2">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Name" aria-label="Server name" required autoFocus className={cn(field, "flex-[1_1_6rem]")} />
          <input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="Address" aria-label="Server address" required className={cn(field, "flex-[2_1_9rem]")} />
          <input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} inputMode="numeric" aria-label="Port" className={cn(field, "w-16")} />
          <button type="submit" className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground cursor-pointer">Save</button>
          <button type="button" onClick={() => { setAdding(false); setError(null); }} className="h-8 px-2 text-xs text-muted-foreground cursor-pointer">Cancel</button>
          <p className="w-full text-xs text-muted-foreground">Use its Tailscale address. Port 22 checks SSH, 443 checks a website.</p>
          {error && <p role="alert" className="w-full text-xs text-bad">{error}</p>}
        </form>
      )}
      {!health && <Empty>Checking…</Empty>}
      {self && (
        <div className="flex items-center gap-2.5 border-t py-2">
          <span className={cn("size-1.5 shrink-0 rounded-full", dot[worst])} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{self.name}</span>
          <span className="flex shrink-0 gap-2.5 font-mono text-xs">
            <span className={ink[level(self.disk)]}>disk {self.disk}%</span>
            <span className={ink[level(self.mem)]}>mem {self.mem}%</span>
          </span>
        </div>
      )}
      {health?.servers.map((x) => (
        <div key={x.id} className="flex items-center gap-2.5 border-t py-2">
          <span className={cn("size-1.5 shrink-0 rounded-full", x.up ? "bg-ok" : "bg-bad")} aria-hidden />
          <span className="min-w-0 flex-1 truncate" title={`${x.host}:${x.port}`}>{x.name}</span>
          <span className={cn("shrink-0 font-mono text-xs", x.up ? "text-muted-foreground" : "text-bad")}>{x.up ? `up, ${x.ms} ms` : "not answering"}</span>
          <RemoveButton label={`Stop checking ${x.name}`} onClick={() => remove(x.id, x.name)} />
        </div>
      ))}
      {health && health.servers.length === 0 && !adding && (
        <p className="border-t py-2 text-xs text-muted-foreground">Add your other servers to see whether each one is answering.</p>
      )}
    </Panel>
  );
}
