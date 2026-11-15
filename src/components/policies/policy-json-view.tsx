"use client";

import { PolicyOptimizeProposal } from "@/components/policies/policy-optimize-proposal";
import type { PolicyBuilderSession } from "@/components/policies/use-policy-builder";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The definition as editable JSON, with the optimizer's proposal beside it when there is one. */
export function PolicyJsonView({ builder, canWrite }: { builder: PolicyBuilderSession; canWrite: boolean }) {
  const { t } = useI18n();
  const { state, dispatch } = builder;
  return (
    <div className={cn("grid min-h-0 min-w-0 flex-1", state.proposal && "md:grid-cols-2")}>
      <textarea
        value={state.jsonText}
        disabled={!canWrite}
        spellCheck={false}
        onChange={(event) => dispatch({ type: "editJson", text: event.target.value })}
        className="h-full min-h-0 resize-none bg-background p-4 font-mono text-[12px] leading-5 text-foreground outline-none"
        aria-label={t("policies.json")}
      />
      {state.proposal ? (
        <PolicyOptimizeProposal
          proposal={state.proposal}
          canWrite={canWrite}
          onApply={builder.applyProposal}
          onDiscard={() => dispatch({ type: "discardProposal" })}
        />
      ) : null}
    </div>
  );
}
