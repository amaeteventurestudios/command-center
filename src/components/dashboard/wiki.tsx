import { Card } from "@/components/ui/card";

export function WikiView({ project }: { project: string }) {
  const pages = [
    { t: "What it is", body: `One page on ${project}: its repos, domains, servers and where it stands. Claude threads read this first, so a new thread starts already knowing the project.` },
    { t: "Runbook", body: "Exact commands for this project, ready to copy into Termius on your phone." },
    { t: "Decisions", body: "A short log of what was decided and why, so the same debate does not come back." },
  ];
  return (
    <section aria-label="Wiki" className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
      {pages.map((p) => (
        <Card key={p.t} className="flex flex-col gap-2 p-4.5">
          <h2 className="text-[15px] font-semibold">{p.t}</h2>
          <p className="leading-relaxed text-muted-foreground">{p.body}</p>
        </Card>
      ))}
    </section>
  );
}
