"use client";

import * as React from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BoxInfo } from "./mailboxes";

export interface Draft {
  boxId?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
  reply?: boolean;
}

/** Write or reply. Nothing leaves until the person presses Send. */
export function Composer({ boxes, draft, onClose, onSent }: { boxes: BoxInfo[]; draft: Draft; onClose: () => void; onSent?: () => void }) {
  const [form, setForm] = React.useState({
    boxId: draft.boxId ?? boxes[0]?.id ?? "",
    to: draft.to ?? "",
    cc: draft.cc ?? "",
    subject: draft.subject ?? "",
    text: draft.text ?? "",
  });
  const [state, setState] = React.useState<{ kind: "idle" | "sending" | "sent" | "error"; msg?: string }>({ kind: "idle" });
  const [showCc, setShowCc] = React.useState(!!draft.cc);
  const firstField = React.useRef<HTMLInputElement>(null);
  const body = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (draft.to) {
      body.current?.focus();
      body.current?.setSelectionRange(0, 0);
    } else firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft.to, onClose]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: "sending" });
    const res = await fetch("/api/mail/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, inReplyTo: draft.inReplyTo, references: draft.references }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) { setState({ kind: "error", msg: data.error ?? "Could not send" }); return; }
    onSent?.();
    setState({ kind: "sent", msg: data.savedToSent ? "Sent, and a copy is in your Sent folder." : "Sent. The copy could not be filed in Sent." });
  };

  const from = boxes.find((b) => b.id === form.boxId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={draft.reply ? "Reply" : "Write email"} className="relative flex h-full w-full max-w-2xl flex-col border-l bg-background shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-lg font-semibold">{draft.reply ? "Reply" : "Write email"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-9 items-center justify-center rounded-md hover:bg-hover cursor-pointer [&_svg]:size-4"><X /></button>
        </header>

        {state.kind === "sent" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-[15px]">{state.msg}</p>
            <p className="text-[13px] text-muted-foreground">From {from?.user} to {form.to}</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form onSubmit={send} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-muted-foreground">From</span>
              <select value={form.boxId} onChange={set("boxId")} className="h-9 rounded-md border bg-background px-3 text-sm" required>
                {boxes.map((b) => <option key={b.id} value={b.id}>{b.name} &lt;{b.user}&gt;</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="flex items-center justify-between text-muted-foreground">
                To
                {!showCc && <button type="button" onClick={() => setShowCc(true)} className="text-xs underline-offset-4 hover:underline cursor-pointer">Add Cc</button>}
              </span>
              <Input ref={firstField} value={form.to} onChange={set("to")} placeholder="name@company.com, another@company.com" autoComplete="off" required />
            </label>
            {showCc && (
              <label className="flex flex-col gap-1.5 text-[13px]">
                <span className="text-muted-foreground">Cc</span>
                <Input value={form.cc} onChange={set("cc")} autoComplete="off" />
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-[13px]">
              <span className="text-muted-foreground">Subject</span>
              <Input value={form.subject} onChange={set("subject")} />
            </label>
            <label className="flex flex-1 flex-col gap-1.5 text-[13px]">
              <span className="text-muted-foreground">Message</span>
              <textarea
                ref={body}
                value={form.text}
                onChange={set("text")}
                className="min-h-64 flex-1 resize-none rounded-md border bg-background p-3 text-sm leading-relaxed outline-none focus-visible:border-ring"
              />
            </label>
            {state.kind === "error" && <p role="alert" className="text-[13px] text-bad">{state.msg}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={state.kind === "sending" || !form.boxId}>
                <Send /> {state.kind === "sending" ? "Sending…" : "Send"}
              </Button>
              <span className="text-xs text-muted-foreground">Sends from {from?.user ?? "the mailbox above"} through its own mail server.</span>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
