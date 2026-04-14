import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { BrowserRouter } from "react-router-dom";

import { AgentSyncListener } from "@/components/agent/AgentSyncListener";
import { AgentAuthProvider } from "@/context/AgentAuthContext";
import { AppRouter } from "@/router";

type DeferredPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function App() {
  const [installPrompt, setInstallPrompt] = useState<DeferredPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <AgentAuthProvider>
      <BrowserRouter>
        <AgentSyncListener />
        <AppRouter />

        {installPrompt ? (
          <button
            type="button"
            onClick={handleInstall}
            className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--tenant-primary)] px-4 py-3 text-sm font-semibold text-white shadow"
          >
            <Download size={16} />
            Install App
          </button>
        ) : null}
      </BrowserRouter>
    </AgentAuthProvider>
  );
}