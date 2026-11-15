"use client";

import { Button } from "@/components/ui/button";
import type { McpSignInPhase } from "@/hooks/use-mcp-sign-in";
import { useI18n } from "@/lib/i18n";

/** What the console shows while a provider sign-in is open, with Cancel (and Try again once stalled). */
export function McpSignInStatus({
  phase,
  onCancel,
  onRetry,
}: {
  phase: McpSignInPhase;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  if (phase === "idle") return null;
  return (
    <div role="status" className="space-y-2 text-[12px] leading-5 text-muted-foreground">
      <p>{phase === "stalled" ? t("marketplace.signInStalled") : t("marketplace.signInWaiting")}</p>
      <div className="flex gap-2">
        {phase === "stalled" ? (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t("marketplace.retrySignIn")}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {t("marketplace.cancelSignIn")}
        </Button>
      </div>
    </div>
  );
}
