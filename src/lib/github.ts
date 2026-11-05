// Reads the state of a GitHub pull request so its card can move on its own.
// Uses GITHUB_TOKEN or the tokens added in the dashboard (needed for private repos); public repos work without one.
import "server-only";
import { allTokens, ghFetch } from "@/lib/github-watch";

export interface PrStatus { state: "open" | "merged" | "closed"; draft: boolean; checks: "passing" | "failing" | "running" | "none"; title: string }

const PR = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i;
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Promise<PrStatus | null> }>();

export const isPrUrl = (u?: string) => !!u && PR.test(u);

// Tries the server token, then each token added in the dashboard, so private repos in either account work.
async function gh(path: string) {
  const tokens = await allTokens();
  let last: unknown = null;
  for (const t of tokens.length ? tokens : [undefined]) {
    try { return await ghFetch(path, t); } catch (e) { last = e; }
  }
  throw last;
}

async function read(url: string): Promise<PrStatus | null> {
  const m = url.match(PR);
  if (!m) return null;
  const [, owner, repo, n] = m;
  const pr = await gh(`/repos/${owner}/${repo}/pulls/${n}`);
  let checks: PrStatus["checks"] = "none";
  if (pr.state === "open" && pr.head?.sha) {
    // A token without access to checks still gets the PR's state, just no check line.
    const runs = (await gh(`/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`).catch(() => ({}))).check_runs ?? [];
    if (runs.some((c: { conclusion: string | null }) => ["failure", "timed_out", "cancelled", "action_required"].includes(c.conclusion ?? ""))) checks = "failing";
    else if (runs.some((c: { status: string }) => c.status !== "completed")) checks = "running";
    else if (runs.length) checks = "passing";
  }
  return { state: pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open", draft: !!pr.draft, checks, title: pr.title ?? "" };
}

/** Cached for five minutes per link; null when the link is not a PR or GitHub could not be reached. */
export function prStatus(url: string): Promise<PrStatus | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = read(url).catch(() => { cache.delete(url); return null; });
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** One short line for the card. */
export function prLine(s: PrStatus): string {
  if (s.state === "merged") return "PR merged";
  if (s.state === "closed") return "PR closed without merging";
  const base = s.draft ? "Draft PR" : "PR open";
  return s.checks === "failing" ? `${base}, checks failing` : s.checks === "running" ? `${base}, checks running` : s.checks === "passing" ? `${base}, checks passing` : base;
}
