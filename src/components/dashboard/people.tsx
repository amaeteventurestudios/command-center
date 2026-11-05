"use client";

import * as React from "react";
import { Check } from "lucide-react";
import type { Person } from "@/lib/sample-data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Composer, type Draft } from "./composer";
import { cleanText } from "./reader";
import type { BoxInfo } from "./mailboxes";
import { LATE_DAYS, WAIT_DAYS } from "@/lib/followups";

export function PeopleView({
  people, live = false, boxes = [], onSent, onDismiss, dismissedCount = 0, onUndismissAll,
}: {
  people: Person[]; live?: boolean; boxes?: BoxInfo[]; onSent?: () => void;
  onDismiss?: (mailIds: string[]) => Promise<void>; dismissedCount?: number; onUndismissAll?: () => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const canPick = live && !!onDismiss;
  const mailIdOf = (p: Person) => p.live?.mailId;
  const pickable = people.filter((p) => p.live).map((p) => p.live!.mailId);
  const shownPicked = pickable.filter((id) => picked.has(id));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = pickable.length > 0 && shownPicked.length === pickable.length;
  const dismiss = (ids: string[]) => { onDismiss?.(ids); setPicked((s) => { const n = new Set(s); ids.forEach((i) => n.delete(i)); return n; }); };
  const close = React.useCallback(() => setDraft(null), []);

  const [opening, setOpening] = React.useState<string | null>(null);
  // Replies inside the original thread: same subject, In-Reply-To and References,
  // with the email you sent quoted underneath so the whole exchange stays together.
  const followUp = async (p: Person) => {
    if (!p.live) return;
    const live = p.live;
    const first = p.who.split(/[\s@]/)[0];
    const topic = live.subject.replace(/^re:\s*/i, "");
    setOpening(live.mailId);
    const res = await fetch(`/api/mail/message?id=${encodeURIComponent(live.mailId)}`, { cache: "no-store" }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    setOpening(null);
    const sent = d?.mail as { text: string; date: string; from: string; messageId: string; references: string } | undefined;
    const quote = sent
      ? `\n\nOn ${new Date(sent.date).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}, ${sent.from} wrote:\n${cleanText(sent.text).split("\n").map((l) => `> ${l}`).join("\n")}`
      : "";
    setDraft({
      boxId: live.boxId,
      to: live.address,
      subject: /^re:/i.test(live.subject) ? live.subject : `Re: ${live.subject}`,
      text: `Hi ${first},\n\nJust following up on my email below about ${topic}. ${quote}`,
      inReplyTo: sent?.messageId || undefined,
      references: sent?.references || undefined,
      reply: true,
    });
  };

  return (
    <section aria-label="People and follow-ups" className="flex flex-col gap-3.5">
      {canPick && (shownPicked.length > 0 || dismissedCount > 0) && (
        <div className="flex flex-wrap items-center justify-center gap-2.5 md:justify-between">
          {shownPicked.length > 0
            ? <Button size="sm" onClick={() => dismiss(shownPicked)}><Check /> No reply needed for {shownPicked.length}</Button>
            : <span />}
          {dismissedCount > 0 && (
            <button type="button" onClick={() => onUndismissAll?.()} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline cursor-pointer">
              {dismissedCount} dismissed. Bring them back
            </button>
          )}
        </div>
      )}
      <p className="text-center text-[13px] text-muted-foreground md:text-left">
        {live
          ? <>People you emailed who have not written back for {WAIT_DAYS} days or more. Orange after {LATE_DAYS} days. Worked out from your Sent and Inbox folders.</>
          : <>Add a mailbox under Email and this fills with people waiting on a reply.</>}
      </p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {canPick && (
                <th className="w-10 pl-4 pr-0 py-3">
                  <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(pickable))} aria-label="Select all follow-ups" className="size-4 accent-[var(--accent)] cursor-pointer" />
                </th>
              )}
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Project</th>
              <th className="px-4 py-3 font-medium">Last touch</th>
              <th className="px-4 py-3 font-medium">Next step</th>
              <th className="px-4 py-3 font-medium">Waiting</th>
              <th className="px-4 py-3 font-medium"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className={cn("border-t transition-colors hover:bg-hover", mailIdOf(p) && picked.has(mailIdOf(p)!) && "bg-hover")}>
                {canPick && (
                  <td className="w-10 pl-4 pr-0 py-3.5">
                    {p.live && <input type="checkbox" checked={picked.has(p.live.mailId)} onChange={() => toggle(p.live!.mailId)} aria-label={`Select ${p.who}`} className="size-4 accent-[var(--accent)] cursor-pointer" />}
                  </td>
                )}
                <td className="px-4 py-3.5 font-medium">{p.who}</td>
                <td className="px-4 py-3.5 text-muted-foreground">{p.project}</td>
                <td className="max-w-80 truncate px-4 py-3.5 text-muted-foreground" title={p.last}>{p.last}</td>
                <td className="px-4 py-3.5">{p.next}</td>
                <td className={cn("whitespace-nowrap px-4 py-3.5 font-mono text-xs", p.late ? "text-accent" : "text-muted-foreground")}>{p.due}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className="inline-flex gap-1.5">
                    <Button variant="outline" size="sm" title={p.live ? undefined : "Sample person"} disabled={!p.live || opening === p.live.mailId} onClick={() => followUp(p)}>{p.live && opening === p.live.mailId ? "Opening…" : "Write follow-up"}</Button>
                    {canPick && p.live && (
                      <Button variant="ghost" size="sm" title="No reply needed: take this off the list" onClick={() => dismiss([p.live!.mailId])}>No reply needed</Button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {people.length === 0 && <p className="border-t p-5 text-center text-muted-foreground">{live ? "Nobody is waiting on you, and you are not waiting on anybody" : "No one tracked yet"}</p>}
      </div>
      {draft && <Composer boxes={boxes} draft={draft} onClose={close} onSent={onSent} />}
    </section>
  );
}
