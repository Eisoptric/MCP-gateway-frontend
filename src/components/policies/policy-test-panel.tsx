"use client";

import { Button } from "@/components/ui/button";
import { busyKeys, controlEnabled } from "@/components/policies/builder-state";
import type { ToolGroup } from "@/components/policies/policy-builder-schema";
import { ToolOptions, inputClass } from "@/components/policies/policy-node-inspector";
import type { PolicyBuilderSession } from "@/components/policies/use-policy-builder";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Saves the policy, then asks the server what it decides for one capability call. */
export function PolicyTestPanel({
  builder,
  toolNames,
  toolGroups,
}: {
  builder: PolicyBuilderSession;
  toolNames: string[];
  toolGroups: ToolGroup[];
}) {
  const { t } = useI18n();
  const { state, dispatch } = builder;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-[13px]">
        {t("policies.capability")}
        <select value={state.testTool} onChange={(event) => dispatch({ type: "testTool", value: event.target.value })} className={inputClass}>
          <option value="">{t("policies.capability")}</option>
          <ToolOptions names={toolNames} groups={toolGroups} />
        </select>
      </label>
      <label className="min-w-[240px] flex-1 text-[13px]">
        {t("policies.arguments")}
        <input
          value={state.testArgs}
          onChange={(event) => dispatch({ type: "testArgs", value: event.target.value })}
          className={cn(inputClass, "font-mono")}
        />
      </label>
      <Button type="button" disabled={!controlEnabled(state, "runTest")} onClick={() => void builder.runTest()}>
        {t(busyKeys(state).runTest)}
      </Button>
      {state.testResult ? <p className="w-full text-[13px]">{state.testResult}</p> : null}
    </div>
  );
}
