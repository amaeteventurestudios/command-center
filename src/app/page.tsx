import { Suspense } from "react";
import { headers } from "next/headers";
import { Dashboard } from "@/components/dashboard/dashboard";
import { spacesForHost } from "@/lib/workspace";

async function HostDashboard() {
  const host = (await headers()).get("host");
  return <Dashboard spaces={spacesForHost(host)} />;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HostDashboard />
    </Suspense>
  );
}
