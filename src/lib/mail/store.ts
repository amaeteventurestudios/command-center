// Mailbox list, kept on the server in one JSON file (the Docker volume).
// Passwords never leave the server: the API only ever returns `publicBox`.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { SpaceId } from "@/lib/config";

export interface Mailbox {
  id: string;
  name: string;       // label, e.g. "Acme"
  space: SpaceId;     // a space id from command.config.json
  project: string;    // project it is tagged with in the dashboard
  user: string;       // full email address, also the IMAP login
  pass: string;
  host: string;       // IMAP server, e.g. mail.example.com
  port: number;       // 993 (IMAP over TLS)
  smtpHost?: string;  // defaults to host
  smtpPort?: number;  // defaults to 465
}

export type PublicMailbox = Omit<Mailbox, "pass">;

const FILE = process.env.MAIL_STORE || "/data/mailboxes.json"; // dev: MAIL_STORE=./data/mailboxes.json

export async function loadBoxes(): Promise<Mailbox[]> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8"));
    return Array.isArray(raw?.mailboxes) ? raw.mailboxes : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function saveBoxes(boxes: Mailbox[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ mailboxes: boxes }, null, 2), { mode: 0o600 });
  await fs.rename(tmp, FILE);
}

export function publicBox(box: Mailbox): PublicMailbox {
  const { id, name, space, project, user, host, port } = box;
  return { id, name, space, project, user, host, port };
}

export async function addBox(input: Omit<Mailbox, "id">): Promise<Mailbox> {
  const boxes = await loadBoxes();
  const box = { ...input, id: randomUUID() };
  await saveBoxes([...boxes.filter((b) => b.user.toLowerCase() !== input.user.toLowerCase()), box]);
  return box;
}

export async function removeBox(id: string): Promise<boolean> {
  const boxes = await loadBoxes();
  const next = boxes.filter((b) => b.id !== id);
  if (next.length === boxes.length) return false;
  await saveBoxes(next);
  return true;
}
