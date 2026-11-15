"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { consoleQueryKey } from "@/hooks/use-console";
import { useI18n } from "@/lib/i18n";
import { authorizeMcp, mcpOauthErrorText } from "@/lib/mcp-authorize";

type Target = { name: string; endpoint: string };
export type McpSignInPhase = "idle" | "waiting" | "stalled";

/**
 * One provider sign-in at a time, with a way to cancel it. `start` resolves to the error text to
 * show: "" when it connected or the user cancelled, null when a newer start replaced it.
 */
export function useMcpSignIn() {
  const { t } = useI18n();
  const client = useQueryClient();
  const [phase, setPhase] = useState<McpSignInPhase>("idle");
  const current = useRef<AbortController | null>(null);

  // Leaving the page stops the polling; the sign-in itself still finishes on the API.
  useEffect(() => () => current.current?.abort(), []);

  async function start(body: Target): Promise<string | null> {
    current.current?.abort();
    const own = new AbortController();
    current.current = own;
    setPhase("waiting");
    try {
      await authorizeMcp(body, {
        signal: own.signal,
        onStalled: () => {
          if (current.current === own) setPhase("stalled");
        },
      });
      await client.invalidateQueries({ queryKey: consoleQueryKey });
      return current.current === own ? "" : null;
    } catch (error) {
      // A newer attempt replaced this one; its own result is what counts.
      if (current.current !== own) return null;
      return mcpOauthErrorText(error, t);
    } finally {
      if (current.current === own) {
        current.current = null;
        setPhase("idle");
      }
    }
  }

  function cancel() {
    current.current?.abort();
  }

  return { phase, pending: phase !== "idle", start, cancel };
}
