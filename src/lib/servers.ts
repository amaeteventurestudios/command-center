// Server health for the Servers panel: disk and memory of the machine the dashboard
// runs on, and an "is it answering" check for the other servers you add.
import "server-only";
import { statfs } from "node:fs/promises";
import os from "node:os";
import net from "node:net";
import type { ServerEntry } from "./state";

export interface SelfHealth { name: string; disk: number; mem: number; load: number; cores: number }
export interface Reach { id: string; name: string; host: string; port: number; up: boolean; ms: number | null }

const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);

/** The data volume sits on the host's disk, so its usage is the server's disk usage. */
export async function selfHealth(): Promise<SelfHealth> {
  let disk = 0;
  try {
    const f = await statfs(process.env.DATA_DIR || "/data");
    disk = pct((f.blocks - f.bfree) * f.bsize, (f.blocks - f.bfree + f.bavail) * f.bsize);
  } catch { /* no /data in local runs */ }
  const total = os.totalmem();
  return {
    name: process.env.SERVER_NAME || "This server",
    disk,
    mem: pct(total - os.freemem(), total),
    load: Math.round(os.loadavg()[0] * 10) / 10,
    cores: os.cpus().length,
  };
}

function knock(host: string, port: number, timeout = 4000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = net.connect({ host, port });
    const done = (ms: number | null) => { sock.destroy(); resolve(ms); };
    sock.setTimeout(timeout, () => done(null));
    sock.once("connect", () => done(Date.now() - start));
    sock.once("error", () => done(null));
  });
}

const cache = new Map<string, { at: number; ms: Promise<number | null> }>();
const TTL_MS = 60 * 1000;

export async function reach(list: ServerEntry[]): Promise<Reach[]> {
  return Promise.all(list.map(async (s) => {
    const key = `${s.host}:${s.port}`;
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.at > TTL_MS) { hit = { at: Date.now(), ms: knock(s.host, s.port) }; cache.set(key, hit); }
    const ms = await hit.ms;
    return { ...s, up: ms !== null, ms };
  }));
}
