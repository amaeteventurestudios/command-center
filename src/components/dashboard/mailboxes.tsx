"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { SpaceId } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface BoxInfo { id: string; name: string; space: SpaceId; project: string; user: string; host: string; port: number }
export interface BoxError { id: string; name: string; error: string }

const HOST_KEY = "command.mailHost";
const readHost = () => { try { return localStorage.getItem(HOST_KEY) ?? ""; } catch { return ""; } };
const saveHost = (h: string) => { try { localStorage.setItem(HOST_KEY, h); } catch {} };

export function Mailboxes({
  space, spaceTitle, projects, boxes, errors, hidden = [], onChanged, onClose,
}: {
  space: SpaceId; spaceTitle: string; projects: string[]; boxes: BoxInfo[]; errors: BoxError[]; hidden?: string[];
  onChanged: () => void; onClose: () => void;
}) {
  const [adding, setAdding] = React.useState(boxes.length === 0);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(() => ({ name: "", project: "", user: "", pass: "", host: readHost() }));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const errorOf = (id: string) => errors.find((e) => e.id === id)?.error;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      const res = await fetch("/api/mailboxes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, space, project: form.project || form.name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setProblem(data.error ?? "Could not add this mailbox"); return; }
      saveHost(form.host);
      setForm((f) => ({ name: "", project: "", user: "", pass: "", host: f.host }));
      setAdding(false);
      onChanged();
    } finally { setBusy(false); }
  };

  const remove = async (b: BoxInfo) => {
    if (!window.confirm(`Remove ${b.user} from the dashboard? Nothing is deleted from the mailbox itself.`)) return;
    await fetch(`/api/mailboxes?id=${encodeURIComponent(b.id)}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <section aria-label={`${spaceTitle} mailboxes`} className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="font-semibold">{spaceTitle} mailboxes <span className="font-mono text-xs font-normal text-muted-foreground">{boxes.length}</span></h2>
        <div className="flex gap-1.5">
          {!adding && <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add mailbox</Button>}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close mailboxes"><X /></Button>
        </div>
      </div>

      {boxes.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 last:border-b-0">
          <span className="min-w-28 font-medium">{b.name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{b.user}</span>
          <span className="text-xs text-muted-foreground">{b.project}</span>
          {errorOf(b.id) && <span className="w-full text-xs text-bad sm:order-last">{errorOf(b.id)}</span>}
          <Button size="sm" variant="ghost" onClick={() => remove(b)} aria-label={`Remove ${b.user}`}><Trash2 /></Button>
        </div>
      ))}

      {adding && (
        <form onSubmit={add} className="grid gap-3 border-t px-4 py-4 sm:grid-cols-2 first:border-t-0">
          <Field label="Name, as shown here"><Input value={form.name} onChange={set("name")} placeholder="Acme" required /></Field>
          <Field label="Project">
            <Input value={form.project} onChange={set("project")} placeholder={form.name || "Same as name"} list="mailbox-projects" />
            <datalist id="mailbox-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Email address"><Input type="email" value={form.user} onChange={set("user")} placeholder="you@example.com" autoComplete="off" required /></Field>
          <Field label="Password"><Input type="password" value={form.pass} onChange={set("pass")} autoComplete="new-password" required /></Field>
          <Field label="Mail server (IMAP)" className="sm:col-span-2">
            <Input value={form.host} onChange={set("host")} placeholder="mail.example.com, or your host's mail server" required />
          </Field>
          {problem && <p role="alert" className="text-[13px] text-bad sm:col-span-2">{problem}</p>}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Check and add"}</Button>
            {boxes.length > 0 && <Button type="button" variant="ghost" onClick={() => { setAdding(false); setProblem(null); }}>Cancel</Button>}
            <span className="text-xs text-muted-foreground">Goes into {spaceTitle}. The password stays on your server and is never shown again.</span>
          </div>
        </form>
      )}
      <HiddenSenders hidden={hidden} onChanged={onChanged} />
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-[13px]", className)}>
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function HiddenSenders({ hidden, onChanged }: { hidden: string[]; onChanged: () => void }) {
  const [entry, setEntry] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const r = await fetch("/api/mail/hidden", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entry }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setProblem(d.error ?? "Could not hide that"); return; }
    setEntry("");
    onChanged();
  };
  const remove = async (h: string) => {
    await fetch(`/api/mail/hidden?entry=${encodeURIComponent(h)}`, { method: "DELETE" });
    onChanged();
  };
  return (
    <div className="flex flex-col gap-2 border-t px-4 py-3">
      <h3 className="text-[13px] font-semibold">Hidden senders <span className="font-normal text-muted-foreground">(all workspaces; mail stays in the mailbox)</span></h3>
      {hidden.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {hidden.map((h) => (
            <li key={h} className="flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5 font-mono text-xs">
              {h}
              <button type="button" onClick={() => remove(h)} aria-label={`Show ${h} again`} title="Show again" className="inline-flex size-5 items-center justify-center rounded hover:bg-hover cursor-pointer [&_svg]:size-3"><X /></button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input value={entry} onChange={(e) => setEntry(e.target.value)} placeholder="name@company.com or @company.com" aria-label="Sender or domain to hide" className="h-8 max-w-sm flex-1" />
        <Button type="submit" size="sm" variant="outline">Hide</Button>
      </form>
      {problem && <p role="alert" className="text-xs text-bad">{problem}</p>}
    </div>
  );
}
