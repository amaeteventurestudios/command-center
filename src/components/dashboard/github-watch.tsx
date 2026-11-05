"use client";

import * as React from "react";
import { GitPullRequest, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Info { tokens: { id: string; login: string }[]; server: boolean; prs: number; repos: number }

/** Connect GitHub so Claude's pull requests turn into cards by themselves. */
export function GithubWatch({ onChanged }: { onChanged: () => void }) {
  const [info, setInfo] = React.useState<Info | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [token, setToken] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/github", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setInfo(d)).catch(() => {});
  }, []);
  React.useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try {
      const r = await fetch("/api/github", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setProblem(d.error ?? "Could not add this token"); return; }
      setToken(""); setAdding(false); load(); onChanged();
    } finally { setBusy(false); }
  };
  const remove = async (id: string, login: string) => {
    if (!window.confirm(`Stop watching GitHub as ${login}? Cards already on the board stay.`)) return;
    await fetch(`/api/github?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    load();
  };

  if (!info) return null;
  const on = info.server || info.tokens.length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground sm:justify-start">
        {on
          ? <span><GitPullRequest className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />Watching GitHub for Claude&apos;s pull requests: {info.prs} in {info.repos} {info.repos === 1 ? "repo" : "repos"} over the last two weeks.</span>
          : <span><GitPullRequest className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />Connect GitHub and every pull request Claude opens becomes a card here, moving to Done when it merges.</span>}
        {info.tokens.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]">
            {t.login}
            <button type="button" aria-label={`Stop watching as ${t.login}`} onClick={() => remove(t.id, t.login)} className="cursor-pointer rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-3" /></button>
          </span>
        ))}
        {!adding && <Button size="sm" variant="outline" onClick={() => setAdding(true)}>{on ? "Add another account" : "Connect GitHub"}</Button>}
      </div>
      {adding && (
        <form onSubmit={add} className="grid gap-2 rounded-lg border p-3">
          <label htmlFor="gh-token" className="text-[13px] font-medium">GitHub token (read-only)</label>
          <p className="text-xs text-muted-foreground">
            Make a fine-grained token at{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">github.com/settings/personal-access-tokens/new</a>.
            Pick the account or organisation as the owner, choose all repositories, and give it read-only access to Contents and Pull requests. Make one for each owner (for example your own account and your company org). It is kept on the server and never shown again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input id="gh-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." className="min-w-0 flex-1" required />
            <Button type="submit" size="sm" disabled={busy || !token}>{busy ? "Checking" : "Connect"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setProblem(null); setToken(""); }}>Cancel</Button>
          </div>
          {problem && <p role="alert" className="text-xs text-bad">{problem}</p>}
        </form>
      )}
    </div>
  );
}
