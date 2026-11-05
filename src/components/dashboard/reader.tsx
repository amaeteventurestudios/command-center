"use client";

import * as React from "react";
import { EyeOff, ImageIcon, Inbox, Paperclip, Reply, X } from "lucide-react";
import type { Draft } from "./composer";
import { Button } from "@/components/ui/button";

interface FullMail {
  subject: string; from: string; to: string; cc: string; date: string;
  html: string | null; text: string; attachments: { name: string; size: number }[];
  messageId: string; references: string; replyTo: string;
}

type Load = { state: "loading" } | { state: "error"; error: string } | { state: "ok"; mail: FullMail; project: string; box: string };

// Remote images are blocked until asked for: they are how senders track opens.
const page = (html: string, images: boolean) => `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: cid:${images ? " https: http:" : ""}">
<base target="_blank">
<style>html,body{margin:0;background:#fff;color:#111;font:14px/1.55 -apple-system,system-ui,sans-serif}body{padding:20px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>
</head><body>${html}</body></html>`;

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function Reader({ id, onClose, onReply, onHidden, onMoved }: { id: string; onClose: () => void; onReply?: (d: Draft) => void; onHidden?: () => void; onMoved?: () => void }) {
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  const [images, setImages] = React.useState(false);
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [moving, setMoving] = React.useState(false);
  const notSpam = async () => {
    setMoving(true);
    const r = await fetch("/api/mail/notspam", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
    setMoving(false);
    if (r?.ok) { onMoved?.(); onClose(); }
    else window.alert("Could not move it. Try again from your mail app.");
  };
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    let gone = false;
    fetch(`/api/mail/message?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (gone) return;
        if (!r.ok) setLoad({ state: "error", error: d.error ?? "Could not open this email" });
        else setLoad({ state: "ok", mail: d.mail, project: d.box.project, box: d.box.user });
      })
      .catch(() => { if (!gone) setLoad({ state: "error", error: "Could not reach the server" }); });
    return () => { gone = true; };
  }, [id]);

  React.useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fit = () => {
    const f = frame.current;
    const doc = f?.contentDocument;
    if (f && doc) f.style.height = `${Math.max(240, doc.documentElement.scrollHeight)}px`;
  };

  const mail = load.state === "ok" ? load.mail : null;
  const hasRemote = !!mail?.html && /<img[^>]+src=["']?https?:/i.test(mail.html);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close email" className="absolute inset-0 bg-black/60 cursor-default" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={mail?.subject ?? "Email"}
        className="relative flex h-full w-full max-w-3xl flex-col border-l bg-background shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-snug">{mail?.subject ?? (load.state === "error" ? "Could not open" : "Opening…")}</h2>
            {load.state === "ok" && (
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
                <dt className="text-muted-foreground">From</dt><dd className="min-w-0 break-words">{load.mail.from}</dd>
                <dt className="text-muted-foreground">To</dt><dd className="min-w-0 break-words">{load.mail.to}</dd>
                {load.mail.cc && <><dt className="text-muted-foreground">Cc</dt><dd className="min-w-0 break-words">{load.mail.cc}</dd></>}
                <dt className="text-muted-foreground">Date</dt><dd>{new Date(load.mail.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</dd>
                <dt className="text-muted-foreground">Inbox</dt><dd className="min-w-0 break-words">{load.project} <span className="font-mono text-xs text-muted-foreground">{load.box}</span></dd>
              </dl>
            )}
          </div>
          {mail && id.includes(":spam:") && (
            <Button variant="outline" size="sm" className="mt-1" disabled={moving} title="Move this email from Spam to your Inbox, on the mail server" onClick={notSpam}><Inbox /> Not spam</Button>
          )}
          {mail && onHidden && /:(in|spam):/.test(id) && (
            <Button variant="ghost" size="sm" className="mt-1" title="Stop showing email from this sender here" onClick={() => hideSender(mail, onHidden)}><EyeOff /> Hide sender</Button>
          )}
          {mail && onReply && (
            <Button variant="outline" size="sm" className="mt-1" onClick={() => onReply(replyDraft(id, mail))}><Reply /> Reply</Button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-hover cursor-pointer [&_svg]:size-4"><X /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {load.state === "loading" && <p className="p-6 text-center text-muted-foreground">Opening…</p>}
          {load.state === "error" && <p className="p-6 text-center text-bad">{load.error}</p>}
          {mail && (
            <div className="flex flex-col gap-3 p-4 sm:p-5">
              {hasRemote && !images && (
                <div className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground sm:justify-between">
                  <span>Pictures from the web are hidden, so the sender can&apos;t tell you opened this.</span>
                  <Button size="sm" variant="outline" onClick={() => setImages(true)}><ImageIcon /> Show pictures</Button>
                </div>
              )}
              {mail.html ? (
                <iframe
                  ref={frame}
                  title="Email body"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={page(mail.html, images)}
                  onLoad={fit}
                  className="w-full rounded-lg border bg-white"
                  style={{ height: 240 }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-lg border bg-card p-4 font-sans text-[14px] leading-relaxed">{cleanText(mail.text) || "(empty)"}</pre>
              )}
              {mail.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {mail.attachments.map((a, i) => (
                    <li key={i} className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs">
                      <Paperclip className="size-3.5 text-muted-foreground" aria-hidden /> {a.name} <span className="text-muted-foreground">{size(a.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {id.includes(":spam:") && <p className="text-center text-xs text-bad">This reply is in your Spam folder. Press Not spam to move it to your Inbox.</p>}
              <p className="text-center text-xs text-muted-foreground">Opened here without marking it read. It stays unread on the server and in your Mail app.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** Drops image and link placeholders ("[image: logo]", "[cid:…]", "[https://…]") and extra blank lines. */
export function cleanText(t: string): string {
  return t
    .replace(/\[(?:image:?[^\]]*|cid:[^\]]*|https?:\/\/[^\]\s]+)\]/gi, "")
    .replace(/(\S) {2,}/g, "$1 ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function replyDraft(id: string, m: FullMail): Draft {
  const quoted = cleanText(m.text).split("\n").map((l) => `> ${l}`).join("\n");
  const when = new Date(m.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  return {
    boxId: id.split(":")[0],
    to: m.replyTo,
    subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
    text: `\n\nOn ${when}, ${m.from} wrote:\n${quoted}`,
    inReplyTo: m.messageId || undefined,
    references: m.references || undefined,
    reply: true,
  };
}

async function hideSender(m: FullMail, done: () => void) {
  const address = m.replyTo || (m.from.match(/<([^>]+)>/)?.[1] ?? m.from);
  if (!window.confirm(`Stop showing email from ${address} in the dashboard? It stays in your mailbox, and you can undo this under Mailboxes.`)) return;
  const r = await fetch("/api/mail/hidden", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entry: address }) });
  if (r.ok) done();
}
