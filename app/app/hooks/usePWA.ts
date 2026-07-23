"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  isOffline: boolean;
  isIOS: boolean;
  swRegistered: boolean;
  promptInstall: () => Promise<void>;
}

function detectIOS(): boolean {
  if (typeof window === "undefined") return false;

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectOffline(): boolean {
  if (typeof navigator === "undefined") return false;
  return !navigator.onLine;
}

export function usePWA(): PWAState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isInstalled, setIsInstalled] = useState<boolean>(() =>
    detectStandalone(),
  );
  const [isOffline, setIsOffline] = useState<boolean>(() => detectOffline());
  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    const ios = detectIOS();
    const standalone = detectStandalone();
    return ios && !standalone;
  });
  const [swRegistered, setSwRegistered] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);

    let updateInterval: ReturnType<typeof setInterval> | null = null;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          setSwRegistered(true);
          updateInterval = setInterval(() => {
            reg.update().catch(() => {});
          }, 60_000);
        })
        .catch((err) => {
          console.error("SW registration failed:", err);
        });
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);

      if (updateInterval) {
        clearInterval(updateInterval);
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return {
    isInstallable,
    isInstalled,
    isOffline,
    isIOS,
    swRegistered,
    promptInstall,
  };
}
