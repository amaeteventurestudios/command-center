// Everything personal lives in command.config.json at the repo root: your spaces
// (a company, a client, side projects...), their Claude projects and accent colours.
// It is read at build time, so rebuild after you change it.
import raw from "../../command.config.json";

export type SpaceId = string;

export interface SpaceConfig {
  id: SpaceId;
  /** Short name in the top bar and switch, e.g. "Work". */
  title: string;
  /** Long name, e.g. the company name. */
  name: string;
  /** Accent colour in light mode and dark mode. */
  accent: string;
  accentDark: string;
  /** Same names as your Claude projects, so a thread sits under the project it lives in. */
  projects: string[];
  /** GitHub users or orgs whose repos belong to this space when no project name matches. */
  githubOwners: string[];
  /** Host names that show only this space (e.g. work.example.com). Empty: shown on every host. */
  hosts: string[];
}

interface Config {
  spaces: SpaceConfig[];
  /** Repos whose name matches no project, and where their PRs go. */
  repoHome: Record<string, { space: SpaceId; project: string }>;
  /** Where a PR goes when nothing else matches. Default: first space, first project. */
  fallback?: { space: SpaceId; project: string };
}

const str = (v: unknown, d = "") => (typeof v === "string" && v.trim() ? v.trim() : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

function load(): Config {
  const r = raw as Record<string, unknown>;
  const list = Array.isArray(r.spaces) ? r.spaces : [];
  const spaces: SpaceConfig[] = list.map((s: Record<string, unknown>, i: number) => ({
    id: str(s.id, `space${i + 1}`).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    title: str(s.title, `Space ${i + 1}`),
    name: str(s.name, str(s.title, `Space ${i + 1}`)),
    accent: str(s.accent, "#2563eb"),
    accentDark: str(s.accentDark, str(s.accent, "#60a5fa")),
    projects: strs(s.projects),
    githubOwners: strs(s.githubOwners).map((o) => o.toLowerCase()),
    hosts: strs(s.hosts).map((h) => h.toLowerCase()),
  }));
  if (!spaces.length) spaces.push({ id: "main", title: "Main", name: "Main", accent: "#2563eb", accentDark: "#60a5fa", projects: [], githubOwners: [], hosts: [] });
  const ids = new Set(spaces.map((s) => s.id));
  const repoHome: Config["repoHome"] = {};
  const rh = (r.repoHome ?? {}) as Record<string, { space?: string; project?: string }>;
  for (const [repo, v] of Object.entries(rh)) if (v && ids.has(str(v.space)) && str(v.project)) repoHome[repo.toLowerCase()] = { space: str(v.space), project: str(v.project) };
  const fb = r.fallback as { space?: string; project?: string } | undefined;
  const fallback = fb && ids.has(str(fb.space)) && str(fb.project) ? { space: str(fb.space), project: str(fb.project) } : undefined;
  return { spaces, repoHome, fallback };
}

export const CONFIG = load();
export const SPACE_IDS: SpaceId[] = CONFIG.spaces.map((s) => s.id);
export const spaceConf = (id: SpaceId) => CONFIG.spaces.find((s) => s.id === id) ?? CONFIG.spaces[0];
/** A known space id, or null. */
export const spaceOf = (v: unknown): SpaceId | null => (typeof v === "string" && SPACE_IDS.includes(v) ? v : null);
/** One value per space, e.g. empty state for each. */
export const perSpace = <T,>(make: (id: SpaceId) => T): Record<SpaceId, T> => Object.fromEntries(SPACE_IDS.map((id) => [id, make(id)]));
