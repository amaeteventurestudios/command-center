import { NextResponse } from "next/server";
import { addBox, loadBoxes, publicBox, removeBox } from "@/lib/mail/store";
import { forget, testBox } from "@/lib/mail/imap";
import { spaceOf } from "@/lib/config";

export async function GET() {
  const boxes = await loadBoxes();
  return NextResponse.json({ mailboxes: boxes.map(publicBox) });
}

const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const space = spaceOf(body.space);
  const user = clean(body.user);
  const pass = typeof body.pass === "string" ? body.pass.slice(0, 500) : "";
  const host = clean(body.host).toLowerCase();
  const name = clean(body.name, 80) || user.split("@")[1] || user;
  const project = clean(body.project, 80) || name;
  const port = Number(body.port) || 993;
  if (!space || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user) || !pass || !/^[a-z0-9.-]+$/.test(host)) {
    return NextResponse.json({ error: "Fill in workspace, email address, password and mail server." }, { status: 400 });
  }
  const candidate = { id: "test", name, space, project, user, pass, host, port } as const;
  const problem = await testBox(candidate);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  const box = await addBox({ name, space, project, user, pass, host, port });
  return NextResponse.json({ mailbox: publicBox(box) });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const ok = await removeBox(id);
  forget(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
