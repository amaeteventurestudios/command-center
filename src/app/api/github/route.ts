// GitHub tokens for the board's PR watch. GET says which accounts are connected
// (never the tokens themselves); POST adds one after GitHub accepts it; DELETE removes one;
// PUT scans GitHub again now instead of waiting for the five-minute cache.
import { NextResponse } from "next/server";
import { addToken, claudePrs, listTokens, refreshPrs, removeToken } from "@/lib/github-watch";

export async function GET() {
  const { tokens, server } = await listTokens();
  const prs = tokens.length || server ? await claudePrs() : [];
  return NextResponse.json({ tokens, server, prs: prs.length, repos: new Set(prs.map((p) => p.repo)).size });
}

export async function PUT() {
  const { tokens, server } = await listTokens();
  const prs = tokens.length || server ? await refreshPrs() : [];
  return NextResponse.json({ tokens, server, prs: prs.length, repos: new Set(prs.map((p) => p.repo)).size, at: new Date().toISOString() });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const token = typeof b.token === "string" ? b.token.trim() : "";
  if (!/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,255}$/.test(token)) {
    return NextResponse.json({ error: "That does not look like a GitHub token. It starts with github_pat_ or ghp_." }, { status: 400 });
  }
  try {
    const added = await addToken(token);
    return NextResponse.json({ added });
  } catch (e) {
    const status = (e as { status?: number }).status;
    const msg = status === 401 ? "GitHub did not accept that token. Check it has not expired." : (e as Error).message || "Could not reach GitHub";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  await removeToken(id);
  return NextResponse.json(await listTokens());
}
