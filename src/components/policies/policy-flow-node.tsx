"use client";

import { createContext, useContext } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useI18n } from "@/lib/i18n";
import { approvalSummary, type FlowData, type FlowNode } from "@/lib/policy-graph";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types";

/** React Flow renders nodes outside the builder's props, so the agent names reach them this way. */
export const AgentContext = createContext<Agent[]>([]);

function nodeTitle(data: FlowData, agents: Agent[], t: (path: string) => string) {
  if (data.kind === "subject") {
    const names = (data.agentIds ?? []).map((id) => agents.find((agent) => agent.id === id)?.name ?? id);
    return names.length ? names.join(", ") : t("policies.anyAgent");
  }
  if (data.kind === "tool") return data.tool || t("policies.capability");
  if (data.kind === "condition") {
    return [data.field, data.operator, data.value].filter((item) => item !== "" && item != null).join(" ") || t("policies.kind.condition");
  }
  if (data.kind === "logic") return (data.op ?? "and").toUpperCase();
  if (data.kind === "decision") {
    if (data.decision === "allow") return t("policies.action.allow");
    if (data.decision === "approval") return t("policies.action.approval");
    return t("policies.action.deny");
  }
  return data.rateLimit ? `${t("policies.rateLimit")} ${data.rateLimit}` : t("policies.kind.enforcement");
}

function PolicyNodeView({ data, selected }: NodeProps<FlowNode>) {
  const { t } = useI18n();
  const agents = useContext(AgentContext);
  const title = nodeTitle(data, agents, t);
  const composed = data.kind === "decision" ? approvalSummary(data) : "";
  return (
    <div className={cn("min-w-[168px] rounded-md border bg-card px-3 py-2 shadow-sm", selected ? "border-foreground" : "border-border")}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-0 !bg-foreground" />
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{t(`policies.kind.${data.kind}`)}</div>
      <div className={cn("mt-1 text-[13px] font-medium", data.kind === "decision" && data.decision === "deny" && "text-destructive")}>
        {title}
      </div>
      {composed ? <div className="mt-1 text-[12px] text-muted-foreground">{composed}</div> : null}
      <Handle type="source" position={Position.Right} className="!size-2 !border-0 !bg-foreground" />
    </div>
  );
}

export const nodeTypes = { policy: PolicyNodeView };
