// Finds the pull requests Claude opens across your GitHub repos, so each one shows
// up on the board by itself. Read-only: it lists repos and PRs and changes nothing.
// Tokens you paste into the dashboard are kept in /data/github.json (mode 600) and
// are never sent back to the browser.
import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SPACES } from "@/lib/sample-data";
import { CONFIG, SPACE_IDS, type SpaceId } from "@/lib/config";

const FILE = process.env.GITHUB_STORE || "/data/github.json";
const API = "https://api.github.com";
const TTL_MS = 5 * 60 * 1000;
const REPO_DAYS = 21; // repos pushed to in the last three weeks
const PR_DAYS = 14; // PRs touched in the last two weeks

interface StoredToken { id: string; login: string; token: string; added: string }
export interface TokenInfo { id: string; login: string; added: string }
export interface FoundPr { url: string; title: string; owner: string; name: string; state: "open" | "merged" | "closed"; draft: boolean; updated: string; repo: string }

async function readStore(): Promise<StoredToken[]> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8"));
    return Array.isArray(raw?.tokens) ? raw.tokens.filter((t: StoredToken) => t && typeof t.token === "string") : [];
  } catch { return []; }
}

async function writeStore(tokens: StoredToken[]) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ tokens }, null, 2), { mode: 0o600 });
  await fs.rename(tmp, FILE);
  cache = null;
}

/** Every token to try: the server's GITHUB_TOKEN first, then the ones added in the dashboard. */
export async function allTokens(): Promise<string[]> {
  const env = process.env.GITHUB_TOKEN ? [process.env.GITHUB_TOKEN] : [];
  return [...env, ...(await readStore()).map((t) => t.token)];
}

export async function listTokens(): Promise<{ tokens: TokenInfo[]; server: boolean }> {
  return { tokens: (await readStore()).map(({ id, login, added }) => ({ id, login, added })), server: !!process.env.GITHUB_TOKEN };
}

export async function ghFetch(p: string, token?: string) {
  const r = await fetch(`${API}${p}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "command-dashboard", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}`), { status: r.status });
  return r.json();
}

/** Checks the token with GitHub, then keeps it. */
export async function addToken(token: string): Promise<TokenInfo> {
  const me = await ghFetch("/user", token);
  // A fine-grained token is tied to one owner (you or an org); name it after the owners of the repos it can see.
  const repos = await ghFetch("/user/repos?per_page=100", token).catch(() => []);
  const owners = [...new Set((Array.isArray(repos) ? repos : []).map((r: { owner?: { login?: string } }) => r.owner?.login).filter(Boolean))] as string[];
  const login = owners.length ? owners.slice(0, 3).join(", ") : typeof me?.login === "string" ? me.login : "GitHub";
  const list = await readStore();
  if (list.some((t) => t.token === token)) throw new Error("That token is already added");
  const entry = { id: randomUUID(), login, token, added: new Date().toISOString() };
  await writeStore([...list, entry].slice(-6));
  return { id: entry.id, login, added: entry.added };
}

export async function removeToken(id: string) {
  await writeStore((await readStore()).filter((t) => t.id !== id));
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const pretty = (repo: string) => repo.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
// "acme-platform" is the Acme project, "blog-web" is Blog, and so on.
const core = (repo: string) => squash(repo.replace(/[-_.](platform|app|web|site|api|dashboard|mvp|frontend|backend|server|monorepo)$/i, ""));

// Repos whose name matches no project, and the project their PRs belong to (command.config.json "repoHome").
const REPO_HOME = CONFIG.repoHome;
const FALLBACK = CONFIG.fallback ?? { space: SPACE_IDS[0], project: SPACES[SPACE_IDS[0]].projects[0] ?? "Other" };

/**
 * The repo name picks the board project, looked up in every space, so a repo called
 * "website-app" lands under your "Website" project wherever it lives. A repo that
 * matches no project goes to the space whose githubOwners list its owner (as a project
 * named after the repo), otherwise to the fallback project.
 */
export function placeOf(owner: string, repo: string, extra: Record<SpaceId, string[]> = {}): { space: SpaceId; project: string } {
  const fixed = REPO_HOME[repo.toLowerCase()];
  if (fixed) return fixed;
  const owned = CONFIG.spaces.find((s) => s.githubOwners.includes(owner.toLowerCase()))?.id;
  const key = core(repo);
  for (const space of owned ? [owned, ...SPACE_IDS.filter((x) => x !== owned)] : SPACE_IDS) {
    const names = [...SPACES[space].projects, ...(extra[space] ?? [])];
    const hit = names.find((p) => squash(p) === key) ?? names.find((p) => key.length >= 5 && (squash(p).startsWith(key) || key.startsWith(squash(p))));
    if (hit) return { space, project: hit };
  }
  return owned ? { space: owned, project: pretty(repo) } : FALLBACK;
}

/** The space a known Claude project belongs to, whatever space a thread reported. */
export function spaceOfProject(project: string): SpaceId | null {
  const key = squash(project);
  for (const space of SPACE_IDS) if (SPACES[space].projects.some((p) => squash(p) === key)) return space;
  return null;
}

const PR_REPO = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/\d+/i;
/** owner and repo of a PR link, or null. */
export const repoOf = (url?: string) => { const m = url?.match(PR_REPO); return m ? { owner: m[1], name: m[2] } : null; };

export const isClaudePr = (pr: { head?: { ref?: string }; body?: string | null }) =>
  !!pr.head?.ref?.startsWith("claude/") || /generated with \[claude code\]/i.test(pr.body ?? "");

async function scan(): Promise<FoundPr[]> {
  const tokens = await allTokens();
  if (!tokens.length) return [];
  const repoSince = Date.now() - REPO_DAYS * 864e5;
  const prSince = Date.now() - PR_DAYS * 864e5;
  const repos = new Map<string, string>(); // full_name -> token that can read it
  for (const t of tokens) {
    try {
      const list = await ghFetch("/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100", t);
      for (const r of list) if (r?.full_name && Date.parse(r.pushed_at) > repoSince && !repos.has(r.full_name)) repos.set(r.full_name, t);
    } catch { /* a bad or expired token just adds nothing */ }
  }
  // GITHUB_REPOS=owner/repo,owner/repo always gets scanned, even if no token can list it.
  for (const full of (process.env.GITHUB_REPOS ?? "").split(",").map((x) => x.trim()).filter((x) => /^[\w.-]+\/[\w.-]+$/.test(x))) if (!repos.has(full)) repos.set(full, tokens[0]);
  const found: FoundPr[] = [];
  await Promise.all([...repos].slice(0, 40).map(async ([full, t]) => {
    try {
      const pulls = await ghFetch(`/repos/${full}/pulls?state=all&sort=updated&direction=desc&per_page=30`, t);
      const [owner, repo] = full.split("/");
      for (const pr of pulls) {
        if (Date.parse(pr.updated_at) < prSince || !isClaudePr(pr)) continue;
        const state = pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open";
        found.push({ url: pr.html_url, title: pr.title ?? `PR ${pr.number}`, owner, name: repo, state, draft: !!pr.draft, updated: pr.updated_at, repo: full });
      }
    } catch { /* skip a repo GitHub would not list */ }
  }));
  return found.sort((a, z) => z.updated.localeCompare(a.updated)).slice(0, 80);
}

let cache: { at: number; value: Promise<FoundPr[]> } | null = null;

/** Claude's recent PRs across every repo the tokens can read, cached for five minutes. */
export function claudePrs(): Promise<FoundPr[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = scan().catch(() => { cache = null; return [] as FoundPr[]; });
  cache = { at: Date.now(), value };
  return value;
}

/**
 * The board's Refresh button: drops the five-minute cache and scans GitHub again.
 * Clicks within 30 seconds of the last scan reuse it, so the GitHub quota stays safe.
 */
export function refreshPrs(): Promise<FoundPr[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  cache = null;
  return claudePrs();
}
