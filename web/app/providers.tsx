"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

function defaultQueryRetry(failureCount: number, error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    /Unauthorized|Forbidden|Invalid or expired token|Missing or invalid Authorization/i.test(msg)
  ) {
    return false;
  }
  return failureCount < 2;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: defaultQueryRetry },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
