// Sends one email through the mailbox's own server and files a copy in its Sent folder.
import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import type { Mailbox } from "./store";

export interface Outgoing {
  to: string;
  cc?: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendResult { ok: true; messageId: string; savedToSent: boolean }

export async function sendMail(box: Mailbox, out: Outgoing): Promise<SendResult> {
  const from = { name: box.name, address: box.user };
  const message = {
    from,
    to: out.to,
    cc: out.cc || undefined,
    subject: out.subject,
    text: out.text,
    inReplyTo: out.inReplyTo || undefined,
    references: out.references || undefined,
  };

  // Build the message once so the copy in Sent is exactly what was sent.
  const raw: Buffer = await new MailComposer(message).compile().build();

  const smtpPort = box.smtpPort || 465;
  const transport = nodemailer.createTransport({
    host: box.smtpHost || box.host,
    port: smtpPort,
    secure: smtpPort !== 587 && smtpPort !== 25, // 465 = TLS from the start; 587 and 25 upgrade with STARTTLS
    auth: { user: box.user, pass: box.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
  const info = await transport.sendMail({ envelope: { from: box.user, to: [out.to, out.cc].filter(Boolean).join(",") }, raw });

  let savedToSent = false;
  const client = new ImapFlow({ host: box.host, port: box.port || 993, secure: true, auth: { user: box.user, pass: box.pass }, logger: false, connectionTimeout: 15000 });
  client.on("error", () => {});
  try {
    await client.connect();
    const folders = await client.list();
    const sent = folders.find((f) => f.specialUse === "\\Sent")?.path ?? folders.find((f) => /^(inbox[./])?sent( items| messages)?$/i.test(f.path))?.path;
    if (sent) {
      await client.append(sent, raw, ["\\Seen"]);
      savedToSent = true;
    }
  } catch {
    // Sent already; a missing copy in Sent is reported, not fatal.
  } finally {
    await client.logout().catch(() => client.close());
  }
  return { ok: true, messageId: info.messageId, savedToSent };
}
