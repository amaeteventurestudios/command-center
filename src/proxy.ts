import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, same, sessionValue } from "@/lib/session";

/** With DASHBOARD_PASSWORD set, every page and API needs the login cookie, except /api/report (it has its own key). */
export async function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.next();
  const have = req.cookies.get(COOKIE)?.value ?? "";
  if (have && same(have, await sessionValue(password))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  matcher: ["/((?!login|api/login|api/report|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/).*)"],
};
