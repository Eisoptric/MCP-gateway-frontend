"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { busyKeys, controlEnabled, statusKey, viewButtonKey } from "@/components/policies/builder-state";
import type { PolicyBuilderSession } from "@/components/policies/use-policy-builder";
import { useI18n } from "@/lib/i18n";
import type { ToolSet } from "@/types";

/** Name, capability set, status and the builder's actions; the actions show only to writers. */
export function PolicyBuilderToolbar({
  builder,
  name,
  onNameChange,
  setId,
  onSetIdChange,
  toolSets,
  canWrite,
  deleting,
  onDelete,
}: {
  builder: PolicyBuilderSession;
  name: string;
  onNameChange: (name: string) => void;
  setId: string;
  onSetIdChange: (setId: string) => void;
  toolSets: ToolSet[];
  canWrite: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { state, dispatch } = builder;
  const labels = busyKeys(state);
  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
      <input
        value={name}
        disabled={!canWrite}
        onChange={(event) => onNameChange(event.target.value)}
        className="h-9 min-w-[180px] flex-1 rounded-md border border-border bg-background px-3 text-[14px] font-medium outline-none focus:border-ring"
        aria-label={t("policies.name")}
      />
      <select
        value={setId}
        disabled={!canWrite}
        onChange={(event) => onSetIdChange(event.target.value)}
        className="h-9 max-w-[220px] rounded-md border border-border bg-background px-2 text-[13px]"
        aria-label={t("policies.capabilitySet")}
      >
        <option value="">{t("policies.noSetSelected")}</option>
        {toolSets.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <span className="text-[12px] text-muted-foreground">
        {t(statusKey(state.status))}
        {" · "}
        {t("policies.version", { n: state.version })}
      </span>
      {canWrite ? (
        <>
          <Button type="button" variant="outline" disabled={!controlEnabled(state, "cycleView")} onClick={builder.cycleView}>
            {t(viewButtonKey(state.view))}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!controlEnabled(state, "optimize")}
            onClick={() => dispatch({ type: "toggleOptimize" })}
          >
            {t(labels.optimize)}
          </Button>
          <Button type="button" variant="outline" disabled={!controlEnabled(state, "save")} onClick={() => void builder.save()}>
            {t(labels.save)}
          </Button>
          <Button type="button" variant="outline" disabled={!controlEnabled(state, "validate")} onClick={() => void builder.validate()}>
            {t(labels.validate)}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!controlEnabled(state, "testPanel")}
            onClick={() => dispatch({ type: "toggleTestPanel" })}
          >
            {t("policies.test")}
          </Button>
          <Button type="button" disabled={!controlEnabled(state, "activate")} onClick={() => void builder.activate()}>
            {t(labels.activate)}
          </Button>
          {confirmingDelete ? (
            <>
              <Button type="button" variant="outline" onClick={() => setConfirmingDelete(false)}>
                {t("policies.cancel")}
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={onDelete}>
                {t("policies.confirmDelete")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={!controlEnabled(state, "delete", deleting)}
              onClick={() => setConfirmingDelete(true)}
            >
              {t("policies.deletePolicy")}
            </Button>
          )}
        </>
      ) : null}
    </header>
  );
}

/** The instructions sent with an optimize request, opened from the toolbar. */
export function PolicyOptimizeForm({ builder }: { builder: PolicyBuilderSession }) {
  const { t } = useI18n();
  const { state, dispatch } = builder;
  return (
    <form
      className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void builder.optimize();
      }}
    >
      <label className="min-w-0 flex-1 text-[13px]">
        {t("policies.instructions")}
        <textarea
          value={state.optimizeInstructions}
          onChange={(event) => dispatch({ type: "optimizeInstructions", value: event.target.value })}
          placeholder={t("policies.instructionsPlaceholder")}
          rows={3}
          className="mt-2 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-ring"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={!controlEnabled(state, "sendOptimize")}>
          {t(busyKeys(state).sendOptimize)}
        </Button>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "closeOptimize" })}>
          {t("policies.cancel")}
        </Button>
      </div>
    </form>
  );
}
