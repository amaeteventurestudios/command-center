// Reads recent mail from each mailbox over IMAP and keeps only mail from people.
import "server-only";
import { ImapFlow, type FetchMessageObject, type MessageAddressObject } from "imapflow";
import type { Mailbox } from "./store";

export interface LiveMail {
  id: string;
  project: string;
  box: string;
  dir: "in" | "out";
  who: string;
  address: string;
  subject: string;
  date: string; // ISO
  unread: boolean;
  spam?: boolean; // found in the Junk/Spam folder
}

export interface BoxResult { mails: LiveMail[]; automated: number; error?: string }

const PER_FOLDER = 30;
const REPLY_DAYS = 45;      // how far back to look for replies to what you sent
const REPLY_LOOKUPS = 40;   // most people searched per mailbox per refresh
const TTL_MS = 2 * 60 * 1000;

// Senders that are never a person.
const ROBOT_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|alerts?|news(letter)?s?|digest|updates?|receipts?|billing|invoices?|marketing|hello-?bot|automated|system)([+._-].*)?$/i;
const ROBOT_DOMAIN = /(^|\.)(github\.com|githubusercontent\.com|vercel\.com|stripe\.com|paypal\.com|google\.com|accounts\.google\.com|linkedin\.com|facebookmail\.com|x\.com|twitter\.com|medium\.com|substack\.com|mailchimp\.com|mcsv\.net|sendgrid\.net|amazonses\.com|cloudflare\.com|namecheap\.com|godaddy\.com|verpex\.com|cpanel\.net|slack\.com|notion\.so|figma\.com|atlassian\.net|zoom\.us|calendly\.com|intercom-mail\.com|hubspot\.com|hs-email\.net)$/i;

export function isAutomated(addr: string, headers: string): boolean {
  const a = addr.toLowerCase();
  const [local = "", domain = ""] = a.split("@");
  if (ROBOT_LOCAL.test(local) || ROBOT_DOMAIN.test(domain)) return true;
  const h = headers.toLowerCase();
  if (/^list-(unsubscribe|id):/m.test(h)) return true;
  if (/^precedence:\s*(bulk|list|junk)/m.test(h)) return true;
  const auto = h.match(/^auto-submitted:\s*(\S+)/m);
  if (auto && auto[1] !== "no") return true;
  return false;
}

type Folder = { path: string; specialUse?: string };
const sentOf = (fs: Folder[]) => fs.find((f) => f.specialUse === "\\Sent")?.path ?? fs.find((f) => /^(inbox[./])?sent( items| messages)?$/i.test(f.path))?.path;
const junkOf = (fs: Folder[]) => fs.find((f) => f.specialUse === "\\Junk")?.path ?? fs.find((f) => /^(inbox[./])?(junk|spam)( e-?mail| mail)?$/i.test(f.path))?.path;

const first = (xs?: MessageAddressObject[]) => xs?.[0] ?? {};
const label = (x: MessageAddressObject) => x.name?.trim() || x.address || "(unknown)";

async function readBox(box: Mailbox): Promise<BoxResult> {
  const client = new ImapFlow({
    host: box.host,
    port: box.port || 993,
    secure: true,
    auth: { user: box.user, pass: box.pass },
    logger: false,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  client.on("error", () => {});
  const mails: LiveMail[] = [];
  let automated = 0;
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  await client.connect();
  try {
    const folders = await client.list();
    const sent = sentOf(folders);
    for (const [path, dir] of [["INBOX", "in"], ...(sent ? [[sent, "out"]] : [])] as [string, "in" | "out"][]) {
      const lock = await client.getMailboxLock(path, { readOnly: true });
      try {
        const exists = client.mailbox ? client.mailbox.exists : 0;
        if (!exists) continue;
        const from = Math.max(1, exists - PER_FOLDER + 1);
        for await (const m of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true, internalDate: true, headers: ["list-unsubscribe", "list-id", "precedence", "auto-submitted"] }) as AsyncIterable<FetchMessageObject>) {
          const env = m.envelope;
          if (!env) continue;
          const peer = dir === "in" ? first(env.from) : first(env.to);
          const addr = peer.address ?? "";
          const date = env.date ?? (m.internalDate ? new Date(m.internalDate) : new Date());
          if (dir === "in" && (addr.toLowerCase() === box.user.toLowerCase() || isAutomated(addr, m.headers?.toString("utf8") ?? ""))) {
            if (date.getTime() > dayAgo) automated++;
            continue;
          }
          if (dir === "out" && isAutomated(addr, "")) continue;
          mails.push({
            id: `${box.id}:${dir}:${m.uid}`,
            project: box.project,
            box: box.name,
            dir,
            who: label(peer),
            address: addr,
            subject: env.subject?.trim() || "(no subject)",
            date: date.toISOString(),
            unread: dir === "in" && !(m.flags?.has("\\Seen") ?? false),
          });
        }
      } finally {
        lock.release();
      }
    }
    await findReplies(client, box, mails, junkOf(folders));
  } finally {
    await client.logout().catch(() => client.close());
  }
  return { mails, automated };
}

/**
 * For each person you emailed lately, looks in the Inbox and the Spam folder for anything
 * they sent back since. That catches replies the recent-mail window or the robot filter
 * missed, and replies that landed in Spam. Found mail is added to the list.
 */
async function findReplies(client: ImapFlow, box: Mailbox, mails: LiveMail[], junk?: string) {
  const since = Date.now() - REPLY_DAYS * 86400000;
  const firstSent = new Map<string, number>();
  for (const m of mails) {
    if (m.dir !== "out" || !m.address) continue;
    const t = Date.parse(m.date);
    if (t < since) continue;
    const a = m.address.toLowerCase();
    if (a === box.user.toLowerCase()) continue;
    firstSent.set(a, Math.min(firstSent.get(a) ?? t, t));
  }
  const people = [...firstSent.entries()].slice(0, REPLY_LOOKUPS);
  if (!people.length) return;
  const have = new Set(mails.map((m) => m.id));
  for (const [path, dir] of [["INBOX", "in"], ...(junk ? [[junk, "spam"]] : [])] as [string, "in" | "spam"][]) {
    const lock = await client.getMailboxLock(path, { readOnly: true }).catch(() => null);
    if (!lock) continue;
    try {
      for (const [address, sentAt] of people) {
        const uids = await client.search({ from: address, since: new Date(sentAt - 86400000) }, { uid: true }).catch(() => false as const);
        if (!uids || !uids.length) continue;
        const uid = Math.max(...uids);
        const id = `${box.id}:${dir}:${uid}`;
        if (have.has(id)) continue;
        const m = await client.fetchOne(String(uid), { envelope: true, flags: true, internalDate: true }, { uid: true }).catch(() => false as const);
        const env = m && m.envelope;
        if (!m || !env) continue;
        const peer = first(env.from);
        if ((peer.address ?? "").toLowerCase() !== address) continue; // FROM search matches substrings
        const date = env.date ?? (m.internalDate ? new Date(m.internalDate) : new Date());
        if (date.getTime() < sentAt) continue;
        have.add(id);
        mails.push({
          id, project: box.project, box: box.name, dir: "in", who: label(peer), address: peer.address ?? address,
          subject: env.subject?.trim() || "(no subject)", date: date.toISOString(),
          unread: !(m.flags?.has("\\Seen") ?? false), ...(dir === "spam" ? { spam: true } : {}),
        });
      }
    } finally {
      lock.release();
    }
  }
}

const cache = new Map<string, { at: number; key: string; result: Promise<BoxResult> }>();
const keyOf = (b: Mailbox) => `${b.user}|${b.host}|${b.port}|${b.project}|${b.name}|${b.pass.length}`;

function cached(box: Mailbox): Promise<BoxResult> {
  const hit = cache.get(box.id);
  const key = keyOf(box);
  if (hit && hit.key === key && Date.now() - hit.at < TTL_MS) return hit.result;
  const result = readBox(box).catch((e: unknown): BoxResult => {
    cache.delete(box.id);
    return { mails: [], automated: 0, error: describe(e) };
  });
  cache.set(box.id, { at: Date.now(), key, result });
  return result;
}

export function describe(e: unknown): string {
  const err = e as { authenticationFailed?: boolean; code?: string; responseText?: string; message?: string };
  if (err?.authenticationFailed) return "Wrong address or password";
  if (err?.code === "ENOTFOUND") return "Mail server name not found";
  if (err?.code === "ECONNREFUSED" || err?.code === "ETIMEDOUT" || err?.code === "ETIMEOUT") return "Could not reach the mail server";
  if (err?.code && /CERT|SSL|TLS/i.test(err.code)) return "The mail server's certificate does not match its name";
  return err?.responseText || err?.message || "Could not read this mailbox";
}

export async function readAll(boxes: Mailbox[]) {
  const results = await Promise.all(boxes.map((b) => cached(b).then((r) => ({ box: b, ...r }))));
  const mails = results.flatMap((r) => r.mails).sort((a, b) => b.date.localeCompare(a.date));
  return {
    mails,
    automated: results.reduce((n, r) => n + r.automated, 0),
    errors: results.filter((r) => r.error).map((r) => ({ id: r.box.id, name: r.box.name, error: r.error! })),
  };
}

/** Connects once to check the address, password and server before saving. */
export async function testBox(box: Mailbox): Promise<string | null> {
  const client = new ImapFlow({ host: box.host, port: box.port || 993, secure: true, auth: { user: box.user, pass: box.pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 10000 });
  client.on("error", () => {});
  try {
    await client.connect();
    await client.logout();
    return null;
  } catch (e) {
    return describe(e);
  }
}

export function forget(id: string) { cache.delete(id); }

export interface FullMail {
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html: string | null;
  text: string;
  attachments: { name: string; size: number }[];
  messageId: string;
  references: string;
  replyTo: string;
}

/**
 * Reads one message without changing it on the server: the folder is opened read-only
 * (EXAMINE) and the body is fetched with BODY.PEEK, so it stays unread everywhere else.
 */
export async function readMessage(box: Mailbox, dir: "in" | "out" | "spam", uid: number): Promise<FullMail | null> {
  const { simpleParser } = await import("mailparser");
  const client = new ImapFlow({ host: box.host, port: box.port || 993, secure: true, auth: { user: box.user, pass: box.pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000 });
  client.on("error", () => {});
  await client.connect();
  try {
    let path = "INBOX";
    if (dir !== "in") {
      const folders = await client.list();
      const found = dir === "out" ? sentOf(folders) : junkOf(folders);
      if (!found) return null;
      path = found;
    }
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!msg || !msg.source) return null;
      const p = await simpleParser(msg.source, { skipImageLinks: true });
      const list = (a: typeof p.from | typeof p.to) =>
        (Array.isArray(a) ? a : a ? [a] : []).flatMap((x) => x.value).map((v) => (v.name ? `${v.name} <${v.address ?? ""}>` : v.address ?? "")).join(", ");
      return {
        subject: p.subject ?? "(no subject)",
        from: list(p.from),
        to: list(p.to),
        cc: list(p.cc),
        date: (p.date ?? new Date()).toISOString(),
        html: typeof p.html === "string" ? p.html : null,
        text: p.text ?? "",
        messageId: p.messageId ?? "",
        references: [...(Array.isArray(p.references) ? p.references : p.references ? [p.references] : []), ...(p.messageId ? [p.messageId] : [])].join(" "),
        replyTo: (p.replyTo?.value[0]?.address ?? (Array.isArray(p.from) ? p.from[0] : p.from)?.value[0]?.address) ?? "",
        attachments: p.attachments.filter((a) => a.contentDisposition !== "inline").map((a) => ({ name: a.filename ?? "attachment", size: a.size })),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** "Not spam": moves one message from the Spam folder back to the Inbox. Nothing is deleted. */
export async function moveToInbox(box: Mailbox, uid: number): Promise<boolean> {
  const client = new ImapFlow({ host: box.host, port: box.port || 993, secure: true, auth: { user: box.user, pass: box.pass }, logger: false, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000 });
  client.on("error", () => {});
  await client.connect();
  try {
    const junk = junkOf(await client.list());
    if (!junk) return false;
    const lock = await client.getMailboxLock(junk);
    try {
      const moved = await client.messageMove(String(uid), "INBOX", { uid: true });
      return !!moved;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
    forget(box.id);
  }
}
