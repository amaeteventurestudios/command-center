import { Suspense } from "react";
import { CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONFIG } from "@/lib/config";

type Q = Promise<{ wrong?: string; wait?: string }>;

export default function Login({ searchParams }: { searchParams: Q }) {
  return <Suspense fallback={null}><Form searchParams={searchParams} /></Suspense>;
}

async function Form({ searchParams }: { searchParams: Q }) {
  const q = await searchParams;
  const problem = q.wait ? "Too many tries. Wait a minute and try again." : q.wrong ? "That password is not right." : null;
  return (
    <main data-space={CONFIG.spaces[0].id} style={{ "--space-accent": CONFIG.spaces[0].accent, "--space-accent-dark": CONFIG.spaces[0].accentDark } as React.CSSProperties} className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-foreground">
      <form method="post" action="/api/login" className="flex w-full max-w-xs flex-col items-center gap-4 text-center">
        <CircleDot className="size-6" aria-hidden />
        <h1 className="text-xl font-semibold tracking-tight">Command Center</h1>
        <label className="flex w-full flex-col gap-1.5 text-left">
          <span className="text-xs text-muted-foreground">Password</span>
          <Input name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={!!problem} />
        </label>
        {problem && <p role="alert" className="text-xs text-bad">{problem}</p>}
        <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Sign in</Button>
      </form>
    </main>
  );
}
