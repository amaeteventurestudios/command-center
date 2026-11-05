import { NextResponse } from "next/server";
import { COOKIE, same, sessionValue } from "@/lib/session";

let fails: number[] = [];

export async function POST(req: Request) {
  const password = process.env.DASHBOARD_PASSWORD;
  const form = await req.formData().catch(() => null);
  const given = String(form?.get("password") ?? "");
  const now = Date.now();
  fails = fails.filter((t) => now - t < 60_000);
  // Relative redirects, so they work behind any proxy or host name.
  const go = (to: string) => new NextResponse(null, { status: 303, headers: { location: to } });
  const back = (q: string) => go(`/login${q}`);
  if (!password) return go("/");
  if (fails.length >= 10) return back("?wait=1");
  if (!same(given, password)) { fails.push(now); return back("?wrong=1"); }
  const res = go("/");
  res.cookies.set(COOKIE, await sessionValue(password), { httpOnly: true, sameSite: "lax", secure: new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
