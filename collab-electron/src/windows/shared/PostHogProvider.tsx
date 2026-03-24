import React, { useState, useEffect, type ReactNode } from "react";

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  if (!import.meta.env.RENDERER_VITE_POSTHOG_KEY || !import.meta.env.RENDERER_VITE_POSTHOG_HOST) {
    return <>{children}</>;
  }
  return <LazyAnalytics>{children}</LazyAnalytics>;
}

function LazyAnalytics({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<React.ComponentType<{ children: ReactNode }> | null>(null);
  useEffect(() => {
    import("./PostHogProviderImpl").then((m) => setProvider(() => m.AnalyticsProviderImpl));
  }, []);
  if (!Provider) return <>{children}</>;
  return <Provider>{children}</Provider>;
}
