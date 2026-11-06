"use client";

import * as React from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InstallPrompt extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

/**
 * Lets the board be installed as its own app (Dock, Start menu or home screen), so it
 * keeps running after the browser is closed. Chrome and Edge show their own install
 * prompt; Safari has no prompt, so the button explains its menu steps instead.
 * Hidden once the board is already running as an installed app.
 */
const STANDALONE = "(display-mode: standalone)";
const subscribe = (cb: () => void) => { const m = window.matchMedia(STANDALONE); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const isStandalone = () => window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;

export function InstallApp() {
  const [prompt, setPrompt] = React.useState<InstallPrompt | null>(null);
  const standalone = React.useSyncExternalStore(subscribe, isStandalone, () => true);
  const [justInstalled, setInstalled] = React.useState(false);
  const installed = standalone || justInstalled;
  const [help, setHelp] = React.useState(false);

  React.useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); setHelp(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!prompt) { setHelp((h) => !h); return; }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    if (outcome === "accepted") setInstalled(true);
    setPrompt(null);
  };

  const ios = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <div className="sm:relative">
      <Button type="button" variant="outline" onClick={install} aria-expanded={prompt ? undefined : help} aria-controls={prompt ? undefined : "install-help"}>
        <Download className="size-4" aria-hidden /> Install app
      </Button>
      {help && (
        <div id="install-help" role="dialog" aria-label="Install the app" className="fixed inset-x-4 top-28 z-50 rounded-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 border bg-background p-4 text-left text-[13px] shadow-lg">
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="font-medium">Install Command Center</p>
            <button type="button" aria-label="Close" onClick={() => setHelp(false)} className="cursor-pointer rounded text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
          </div>
          <p className="text-muted-foreground">It opens in its own window and stays put when you close your browser.</p>
          <ul className="mt-3 grid gap-2">
            {ios
              ? <li><span className="font-medium">iPhone or iPad:</span> tap Share, then Add to Home Screen.</li>
              : <>
                  <li><span className="font-medium">Safari on Mac:</span> File, then Add to Dock.</li>
                  <li><span className="font-medium">Chrome or Edge:</span> the install icon at the right of the address bar.</li>
                  <li><span className="font-medium">Phone:</span> Share or the browser menu, then Add to Home Screen.</li>
                </>}
          </ul>
        </div>
      )}
    </div>
  );
}
