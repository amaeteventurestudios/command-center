// "Waiting on reply": people you emailed who have not written back since.
// Worked out from the mail already on screen, so it is as live as the inbox.
import type { Mail, Person } from "@/lib/sample-data";

const DAY = 86400000;
export const WAIT_DAYS = 3;   // show after this many days without a reply
export const LATE_DAYS = 5;   // turns orange (due) after this many
const MAX_DAYS = 45;          // older threads are probably settled

/** skip: addresses to leave out, such as hidden senders whose replies are filtered away. */
export function followUps(mails: Mail[], own: Set<string>, skip: (address: string) => boolean = () => false, now = Date.now()): Person[] {
  const lastIn = new Map<string, number>();
  for (const m of mails) {
    if (m.dir !== "in" || !m.address || !m.date) continue;
    const a = m.address.toLowerCase();
    lastIn.set(a, Math.max(lastIn.get(a) ?? 0, Date.parse(m.date)));
  }
  const latestOut = new Map<string, Mail>();
  for (const m of mails) {
    if (m.dir !== "out" || !m.address || !m.date) continue;
    const a = m.address.toLowerCase();
    if (own.has(a) || skip(a)) continue;
    const prev = latestOut.get(a);
    if (!prev || Date.parse(m.date) > Date.parse(prev.date!)) latestOut.set(a, m);
  }
  const out: Person[] = [];
  for (const [a, m] of latestOut) {
    const sentAt = Date.parse(m.date!);
    if ((lastIn.get(a) ?? 0) > sentAt) continue;
    const days = Math.floor((now - sentAt) / DAY);
    if (days < WAIT_DAYS || days > MAX_DAYS) continue;
    out.push({
      id: `fu:${m.id}`,
      who: m.who,
      project: m.project,
      last: `You emailed ${days}d ago: ${m.subject}`,
      next: "Follow up, no reply yet",
      due: `${days}d waiting`,
      late: days >= LATE_DAYS,
      live: { boxId: m.id.split(":")[0], address: m.address!, subject: m.subject, mailId: m.id },
    });
  }
  return out.sort((x, y) => Number(y.late) - Number(x.late) || parseInt(y.due) - parseInt(x.due));
}
