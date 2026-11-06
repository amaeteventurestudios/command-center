"use client";

import { InstallApp } from "./install-app";
import * as React from "react";
import { useTheme } from "next-themes";
import { LayoutGrid, Kanban, Mail, Users, Moon, Sun, Plus, CircleDot, Trash2 } from "lucide-react";
import { SPACES, type CardItem, type Column, type Mail as MailItem, type Space } from "@/lib/sample-data";
import { perSpace, spaceConf, type SpaceId } from "@/lib/config";
import { cn } from "@/lib/utils";
import { isHidden } from "@/lib/hidden";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Glance } from "./glance";
import { Board } from "./board";
import { MailView } from "./mail";
import { PeopleView } from "./people";
import { WikiView } from "./wiki";
import { useLiveMail } from "./use-live-mail";
import { ageText, useSaved } from "./use-saved";
import { followUps } from "@/lib/followups";

type View = "glance" | "board" | "mail" | "people" | "project";
type Tab = "board" | "mail" | "people" | "wiki";

export function Dashboard({ spaces }: { spaces: SpaceId[] }) {
  const [space, setSpace] = React.useState<SpaceId>(spaces[0]);
  const [view, setView] = React.useState<View>("glance");
  const [project, setProject] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>("board");
  const [cards, setCards] = React.useState<Record<SpaceId, CardItem[]>>(() => perSpace((id) => SPACES[id].cards));
  const [capText, setCapText] = React.useState("");
  const [projectsOpen, setProjectsOpen] = React.useState(false);
  const [mailOpen, setMailOpen] = React.useState<string | null>(null);

  const live = useLiveMail(space);
  const saved = useSaved(space);
  const [capError, setCapError] = React.useState<string | null>(null);
  const base = SPACES[space];
  const liveOn = live.boxes.length > 0;
  // Built-in projects, minus the ones you removed, plus the ones you added, plus any a mailbox or card uses.
  const projects = React.useMemo(() => {
    const gone = new Set(saved.projects.removed.map((x) => x.toLowerCase()));
    const list = base.projects.filter((p) => !gone.has(p.toLowerCase()));
    const has = (p: string) => list.some((x) => x.toLowerCase() === p.toLowerCase());
    for (const p of [...saved.projects.added, ...live.boxes.map((b) => b.project), ...saved.cards.map((c) => c.project)]) if (p && !has(p)) list.push(p);
    return list;
  }, [base.projects, saved.projects, saved.cards, live.boxes]);
  // Follow-ups you dismissed: saved on the server, hidden here at once.
  const [justDismissed, setJustDismissed] = React.useState<string[]>([]);
  const dismissed = React.useMemo(() => new Set([...live.dismissed, ...justDismissed]), [live.dismissed, justDismissed]);
  const dismiss = React.useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    setJustDismissed((d) => [...d, ...ids]);
    await fetch("/api/mail/dismiss", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
    live.reload();
  }, [live]);
  const undismissAll = React.useCallback(async () => {
    setJustDismissed([]);
    await fetch("/api/mail/dismiss", { method: "DELETE" }).catch(() => {});
    live.reload();
  }, [live]);
  const S = React.useMemo(() => {
    if (!liveOn) return { ...base, projects };
    const mails: MailItem[] = live.mails;
    const inbox = { ...base.inbox, ...Object.fromEntries(live.boxes.map((b) => [b.project, true])) };
    const people = followUps(mails, new Set(live.boxes.map((b) => b.user.toLowerCase())), (a) => isHidden(a, live.hidden))
      .filter((p) => !p.live || !dismissed.has(p.live.mailId));
    return { ...base, mails, people, projects, inbox, filteredToday: live.automated };
  }, [base, projects, liveOn, live.mails, live.boxes, live.automated, live.hidden, dismissed]);
  const fixedProject = (p: string) => live.boxes.some((b) => b.project === p) || saved.cards.some((c) => c.project === p);
  const removeProject = (p: string) => {
    if (!window.confirm(`Take ${p} off your project list? Nothing else is deleted, and you can add it back any time.`)) return;
    saved.removeProject(p).then(() => go("glance")).catch(() => {});
  };
  const realCards = saved.cards.length > 0 || base.cards.length === 0;
  const allCards = React.useMemo<CardItem[]>(
    () => (realCards
      ? saved.cards.map((c) => ({ id: c.id, title: c.title, project: c.project, column: c.column, age: ageText(c.updated), thread: c.url ? { last: c.status ?? "", url: c.url } : undefined }))
      : cards[space]),
    [realCards, saved.cards, cards, space],
  );
  const scoped = <T extends { project: string }>(xs: T[]) => (view === "project" && project ? xs.filter((x) => x.project === project) : xs);

  const openOf = (p: string) => allCards.filter((c) => c.project === p && c.column !== "done").length;
  const needsYou = (p: string) => allCards.some((c) => c.project === p && c.column === "wait") || S.people.some((x) => x.project === p && x.late);
  const isActive = (p: string) => openOf(p) > 0 || S.mails.some((m) => m.project === p);
  const active = S.projects.filter(isActive);
  const quiet = S.projects.filter((p) => !isActive(p));

  const moveCard = (cardId: string, to: Column) => {
    if (realCards) { saved.moveCard(cardId, to).catch(() => {}); return; }
    setCards((prev) => ({ ...prev, [space]: prev[space].map((c) => (c.id === cardId ? { ...c, column: to } : c)) }));
  };

  const go = (v: View) => { setView(v); setProject(null); };
  const openProject = (p: string) => { setView("project"); setProject(p); setTab("board"); setProjectsOpen(false); };

  const capture = (e: React.FormEvent) => {
    e.preventDefault();
    const t = capText.trim();
    if (!t) return;
    setCapError(null);
    saved.capture(t).then(() => setCapText("")).catch((err: Error) => setCapError(err.message));
  };

  const unread = S.mails.filter((m) => m.unread).length;
  const late = S.people.filter((x) => x.late).length;
  const nav: { id: View; name: string; icon: React.ReactNode; badge?: string; accent?: boolean }[] = [
    { id: "glance", name: "At a glance", icon: <LayoutGrid /> },
    { id: "board", name: "Board", icon: <Kanban />, badge: String(allCards.filter((c) => c.column !== "done").length) },
    { id: "mail", name: "Email", icon: <Mail />, badge: unread ? `${unread} new` : undefined, accent: true },
    { id: "people", name: "People", icon: <Users />, badge: late ? `${late} due` : undefined, accent: true },
  ];

  const showBoard = view === "board" || (view === "project" && tab === "board");
  const showMail = view === "mail" || (view === "project" && tab === "mail");
  const showPeople = view === "people" || (view === "project" && tab === "people");
  const showWiki = view === "project" && tab === "wiki";

  const heading =
    view === "project" && project ? project
    : view === "board" ? `${S.title} board`
    : view === "mail" ? `${S.title} email`
    : view === "people" ? `${S.title} people`
    : `${S.title} at a glance`;

  return (
    <div data-space={space} style={{ "--space-accent": spaceConf(space).accent, "--space-accent-dark": spaceConf(space).accentDark } as React.CSSProperties} className="flex min-h-screen flex-col bg-background text-foreground text-sm">
      <header className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 border-b bg-sidebar px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <CircleDot className="size-5 text-accent" aria-hidden />
          <span className="text-[15px] font-semibold tracking-tight">{S.title} Command Center</span>
        </div>
        {spaces.length > 1 && (
          <div role="group" aria-label="Workspace" className="flex gap-1 rounded-lg border bg-muted p-1">
            {spaces.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={space === s}
                onClick={() => { setSpace(s); go("glance"); }}
                className={cn(
                  "h-8 rounded-md px-4 text-[13px] font-medium transition-colors cursor-pointer",
                  space === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {SPACES[s].title}
              </button>
            ))}
          </div>
        )}
        <div className="hidden flex-1 lg:block" />
        <form onSubmit={capture} className="flex w-full max-w-sm gap-1.5 sm:w-auto sm:min-w-80">
          <label className="relative flex-1">
            <span className="sr-only">Quick capture</span>
            <Plus className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={capText} onChange={(e) => setCapText(e.target.value)} placeholder={capError ? "Could not save, try again" : "Capture an idea…"} aria-invalid={!!capError} className={cn("pl-9", capError && "border-bad")} />
          </label>
          <Button type="submit">Add</Button>
        </form>
        <InstallApp />
        <ThemeToggle />
        <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-ok" aria-hidden /> {liveOn ? "Live email" : "Email not connected"}
        </span>
      </header>

      <div className="flex flex-1 flex-wrap items-stretch">
        <nav aria-label="Main" className="flex w-full flex-col gap-0.5 border-b bg-sidebar p-3 md:w-64 md:border-b-0 md:border-r">
          {nav.map((v) => (
            <NavButton key={v.id} on={view === v.id} onClick={() => go(v.id)}>
              <span className="text-muted-foreground [&_svg]:size-4">{v.icon}</span>
              <span className="flex-1 text-left">{v.name}</span>
              {v.badge && <span className={cn("font-mono text-xs", v.accent ? "text-accent" : "text-muted-foreground")}>{v.badge}</span>}
            </NavButton>
          ))}
          <button
            type="button"
            aria-expanded={projectsOpen}
            onClick={() => setProjectsOpen((o) => !o)}
            className="mt-2 flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm md:hidden cursor-pointer"
          >
            {projectsOpen ? "Hide projects" : `Projects (${active.length} active)`}
          </button>
          <div className={cn("flex-col gap-0.5 md:flex", projectsOpen ? "flex" : "hidden")}>
          <p className="mx-2.5 mb-1.5 mt-5 text-xs text-muted-foreground">Active projects</p>
          {active.map((p) => (
            <NavButton key={p} on={view === "project" && project === p} onClick={() => openProject(p)}>
              <span className={cn("size-2 shrink-0 rounded-full", needsYou(p) ? "bg-accent" : "bg-muted-foreground/50")} aria-hidden />
              <span className="flex-1 truncate text-left">{p}</span>
              <span className="font-mono text-xs text-muted-foreground">{openOf(p)}</span>
            </NavButton>
          ))}
          <p className="mx-2.5 mb-1.5 mt-5 text-xs text-muted-foreground">Quiet</p>
          {quiet.map((p) => (
            <NavButton key={p} on={view === "project" && project === p} onClick={() => openProject(p)}>
              <span className="size-2 shrink-0 rounded-full border border-muted-foreground/60" aria-hidden />
              <span className="flex-1 truncate text-left text-muted-foreground">{p}</span>
            </NavButton>
          ))}
          <AddProject onAdd={(name) => saved.addProject(name).then(() => openProject(name))} />
          </div>
        </nav>

        <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-7 px-4 py-8 sm:px-8 lg:px-10">
          <section className="flex flex-wrap items-end justify-center gap-5 text-center md:justify-between md:text-left">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-[clamp(26px,3vw,34px)] font-semibold leading-tight tracking-tight">{heading}</h1>
              <p className="max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground">
                <Summary S={S} cards={scoped(allCards)} view={view} project={project} />
              </p>
            </div>
            <Stats cards={scoped(allCards)} mails={scoped(S.mails)} people={scoped(S.people)} />
          </section>

          {view === "glance" && (
            <Glance space={S} cards={allCards} captured={saved.captured} deadlines={saved.deadlines} onUncapture={saved.uncapture} onAddDeadline={saved.addDeadline} onRemoveDeadline={saved.removeDeadline} liveMail={liveOn} openProject={openProject} openMail={(id) => { setMailOpen(id ?? null); go("mail"); }} go={go} onDismiss={liveOn ? dismiss : undefined} hiddenMail={dismissed} sampleCards={!realCards} noSamples={saved.noSamples} onClearSamples={saved.clearSamples} onDoneCard={realCards ? (id) => moveCard(id, "done") : undefined} />
          )}

          {view === "project" && (
            <div role="tablist" aria-label="Project sections" className="flex flex-wrap justify-center gap-1.5 border-b pb-3">
              {(["board", "mail", "people", "wiki"] as Tab[]).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "h-8 rounded-full border px-3.5 text-[13px] font-medium capitalize transition-colors cursor-pointer",
                    tab === t ? "border-accent bg-accent text-accent-foreground" : "hover:bg-hover"
                  )}
                >
                  {t === "mail" ? "Email" : t}
                </button>
              ))}
              {project && !fixedProject(project) && (
                <button type="button" onClick={() => removeProject(project)} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground cursor-pointer [&_svg]:size-3.5">
                  <Trash2 aria-hidden /> Remove project
                </button>
              )}
            </div>
          )}

          {showBoard && <Board cards={scoped(allCards)} sample={!realCards} projects={S.projects} project={view === "project" ? project : null} onMove={moveCard} onAdd={saved.addCard} onRemove={realCards ? saved.removeCard : undefined} onGithub={saved.reload} />}
          {showMail && <MailView key={space} initialOpen={mailOpen} onOpened={() => setMailOpen(null)} mails={scoped(S.mails)} filtered={S.filteredToday} byProject={view === "mail"} live={liveOn} space={space} spaceTitle={S.title} projects={S.projects} boxes={live.boxes} errors={live.errors} loading={live.loading} onBoxesChanged={live.reload} hidden={live.hidden} hiddenCount={live.hiddenCount} known={live.known} />}
          {showPeople && <PeopleView people={scoped(S.people)} live={liveOn} boxes={live.boxes} onSent={live.reload} onDismiss={dismiss} dismissedCount={dismissed.size} onUndismissAll={undismissAll} />}
          {showWiki && project && <WikiView project={project} />}

          <p className="mt-auto text-center text-xs leading-relaxed text-muted-foreground">
            Cards come from your Claude threads and GitHub; email and follow-ups from the mailboxes you add.
          </p>
        </main>
      </div>
    </div>
  );
}

function AddProject({ onAdd }: { onAdd: (name: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  if (!open) {
    return (
      <NavButton on={false} onClick={() => setOpen(true)} className="mt-2 text-muted-foreground">
        <Plus className="size-4" aria-hidden /> <span className="flex-1 text-left">Add project</span>
      </NavButton>
    );
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setProblem(null);
    onAdd(n).then(() => { setName(""); setOpen(false); }).catch((err: Error) => setProblem(err.message));
  };
  return (
    <form onSubmit={submit} className="mt-2 flex flex-col gap-2 px-1">
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="New project name" maxLength={60} className="h-9" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1">Add</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setName(""); }}>Cancel</Button>
      </div>
      {problem && <p role="alert" className="text-xs text-bad">{problem}</p>}
    </form>
  );
}

function NavButton({ on, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { on: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors cursor-pointer",
        on ? "bg-active font-medium" : "hover:bg-hover",
        className
      )}
      {...props}
    />
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Switch light or dark"
      title="Switch light or dark"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" aria-hidden />
      <Moon className="dark:hidden" aria-hidden />
    </Button>
  );
}

function plural(k: number, one: string, many: string) {
  return `${k} ${k === 1 ? one : many}`;
}

function Summary({ S, cards, view, project }: { S: Space; cards: CardItem[]; view: View; project: string | null }) {
  const c = (col: Column) => cards.filter((x) => x.column === col).length;
  if (view === "project" && project) {
    const unread = S.mails.filter((m) => m.project === project && m.unread).length;
    const late = S.people.filter((x) => x.project === project && x.late).length;
    return <>{S.inbox[project] ? "Has its own inbox. " : "No inbox connected yet. "}{plural(c("now"), "item is", "items are")} moving, {plural(unread, "email", "emails")} unread, {plural(late, "follow-up", "follow-ups")} due.</>;
  }
  if (view === "board") return <>Every card across {S.title}. Drag a card to move it; Claude threads move them too.</>;
  if (view === "mail") return <>People only, from every project inbox. Incoming and sent, tagged by project.</>;
  if (view === "people") return <>Who you are talking to, when you last spoke and what comes next.</>;
  const needs = c("wait") + S.people.filter((x) => x.late).length;
  return <>{plural(needs, "thing needs", "things need")} you. {plural(c("now"), "item is", "items are")} moving and {c("next")} up next.</>;
}

function Stats({ cards, mails, people }: { cards: CardItem[]; mails: { unread: boolean }[]; people: { late: boolean }[] }) {
  const late = people.filter((p) => p.late).length;
  const items = [
    { n: cards.filter((c) => c.column === "wait").length + late, label: "Need you", cls: "text-accent" },
    { n: cards.filter((c) => c.column === "now").length, label: "Moving", cls: "text-ok" },
    { n: mails.filter((m) => m.unread).length, label: "Unread", cls: "" },
    { n: late, label: "Follow-ups due", cls: "" },
  ];
  return (
    <div className="grid w-full grid-cols-2 gap-2.5 sm:flex sm:w-auto sm:flex-wrap sm:justify-center">
      {items.map((s) => (
        <div key={s.label} className="flex min-w-24 flex-col gap-1 rounded-xl border bg-card px-3.5 py-3 text-left">
          <span className={cn("font-mono text-[22px] font-medium", s.cls)}>{s.n}</span>
          <span className="text-xs text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
