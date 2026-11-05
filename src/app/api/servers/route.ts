import { NextResponse } from "next/server";
import { loadState, newId, update } from "@/lib/state";
import { reach, selfHealth } from "@/lib/servers";

const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$|^\d{1,3}(\.\d{1,3}){3}$/i;

export async function GET() {
  const st = await loadState();
  const [self, servers] = await Promise.all([selfHealth(), reach(st.servers)]);
  return NextResponse.json({ self, servers });
}

// { name, host, port }: a server to check. The dashboard only tries to open a connection; it sends nothing.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 40) : "";
  const host = typeof b.host === "string" ? b.host.trim().toLowerCase() : "";
  const port = Number(b.port) || 22;
  if (!name || !HOST.test(host) || port < 1 || port > 65535) {
    return NextResponse.json({ error: "Give a name, an address (like 100.64.0.5 or server.example.com) and a port" }, { status: 400 });
  }
  const st = await update((s) => { if (s.servers.length < 30) s.servers.push({ id: newId(), name, host, port }); });
  return NextResponse.json({ servers: st.servers });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const st = await update((s) => { s.servers = s.servers.filter((x) => x.id !== id); });
  return NextResponse.json({ servers: st.servers });
}
