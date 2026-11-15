"use client";

import { DragEvent, useMemo, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useDeletePolicy } from "@/hooks/use-console";
import { alertMessage } from "@/components/policies/builder-state";
import { connectedToolNames, groupByServer, schemaFields } from "@/components/policies/policy-builder-schema";
import { PolicyBuilderToolbar, PolicyOptimizeForm } from "@/components/policies/policy-builder-toolbar";
import { AgentContext, nodeTypes } from "@/components/policies/policy-flow-node";
import { PolicyForm } from "@/components/policies/policy-form";
import { PolicyJsonView } from "@/components/policies/policy-json-view";
import { NodeInspector } from "@/components/policies/policy-node-inspector";
import { NODE_DRAG_TYPE, PolicyNodeLibrary, isNodeKind } from "@/components/policies/policy-node-library";
import { PolicyTestPanel } from "@/components/policies/policy-test-panel";
import { PolicyProgressBar } from "@/components/policies/policy-thinking";
import { ValidationReport } from "@/components/policies/policy-validation-report";
import { useApprovalDrafts } from "@/components/policies/use-approval-drafts";
import { usePolicyBuilder } from "@/components/policies/use-policy-builder";
import { useI18n } from "@/lib/i18n";
import { definitionFromRules, newNode, toFlow, type FlowData, type FlowNode } from "@/lib/policy-graph";
import type { Agent, Policy, ToolSet } from "@/types";

export function PolicyBuilder({
  policy,
  agents,
  toolSets,
  canWrite,
}: {
  policy: Policy;
  agents: Agent[];
  toolSets: ToolSet[];
  canWrite: boolean;
}) {
  const initial = policy.definition?.nodes?.length ? policy.definition : definitionFromRules(policy.rules);
  const flow = toFlow(initial);
  return (
    <ReactFlowProvider>
      <BuilderCanvas
        policy={policy}
        agents={agents}
        toolSets={toolSets}
        canWrite={canWrite}
        initialNodes={flow.nodes}
        initialEdges={flow.edges}
        converted={!policy.definition?.nodes?.length && policy.rules.length > 0}
      />
    </ReactFlowProvider>
  );
}

function BuilderCanvas({
  policy,
  agents,
  toolSets,
  canWrite,
  initialNodes,
  initialEdges,
  converted,
}: {
  policy: Policy;
  agents: Agent[];
  toolSets: ToolSet[];
  canWrite: boolean;
  initialNodes: FlowNode[];
  initialEdges: Edge[];
  converted: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const remove = useDeletePolicy();
  const flow = useReactFlow<FlowNode, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const groupAccess = useApprovalDrafts(setNodes);
  const [name, setName] = useState(policy.name);
  const [setId, setSetId] = useState(policy.toolSetId ?? policy.definition?.toolSetId ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const analyses = policy.definition?.analyses ?? [];
  const builder = usePolicyBuilder({ policy, name, setId, analyses, nodes, edges, setNodes, setEdges, groupAccess });
  const { view, panel, error, jsonError } = builder.state;
  const alert = alertMessage(error, remove, t);
  const unconfigured = analyses.length > 0 && analyses.every((item) => item.status !== "analyzed");
  const current = nodes.find((node) => node.id === selected) ?? null;
  const setTools = useMemo(() => toolSets.find((item) => item.id === setId)?.items ?? [], [toolSets, setId]);
  const toolGroups = useMemo(() => groupByServer(setTools), [setTools]);
  const schemas = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const set of toolSets) {
      for (const item of set.items) {
        if (item.inputSchema) map.set(item.name, item.inputSchema);
      }
    }
    for (const item of setTools) {
      if (item.inputSchema) map.set(item.name, item.inputSchema);
    }
    return map;
  }, [toolSets, setTools]);
  const conditionTools = current?.data.kind === "condition" ? connectedToolNames(current.id, nodes, edges) : [];
  const conditionFields = conditionTools.flatMap((name) =>
    schemaFields(schemas.get(name)).map((field) => ({ ...field, tool: name }))
  );
  const toolNames = useMemo(() => {
    const fromNodes = nodes.flatMap((node) => (node.data.kind === "tool" && node.data.tool ? [node.data.tool] : []));
    const fromSet = setTools.map((item) => item.name);
    return Array.from(new Set([...fromSet, ...fromNodes]));
  }, [nodes, setTools]);

  function updateNode(id: string, patch: Partial<FlowData>) {
    setNodes((currentNodes) =>
      currentNodes.map((node) => (node.id === id ? { ...node, data: { ...node.data, ...patch } } : node))
    );
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    const kind = event.dataTransfer.getData(NODE_DRAG_TYPE);
    if (!isNodeKind(kind) || !canWrite) return;
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((currentNodes) => currentNodes.concat(newNode(kind, position)));
  }

  return (
    <AgentContext.Provider value={agents}>
    <div className="flex h-full min-h-0 flex-col">
      <PolicyBuilderToolbar
        builder={builder}
        name={name}
        onNameChange={setName}
        setId={setId}
        onSetIdChange={setSetId}
        toolSets={toolSets}
        canWrite={canWrite}
        deleting={remove.isPending}
        onDelete={() => remove.mutate(policy.id, { onSuccess: () => router.push("/policies") })}
      />
      {builder.state.askOptimize ? <PolicyOptimizeForm builder={builder} /> : null}
      {builder.progress ? (
        <div className="border-b border-border px-4 py-3">
          <PolicyProgressBar progress={builder.progress} />
        </div>
      ) : null}
      {unconfigured ? <p className="border-b border-border px-4 py-2 text-[13px] text-muted-foreground">{t("policies.unconfigured")}</p> : null}
      {converted ? <p className="border-b border-border px-4 py-2 text-[13px] text-muted-foreground">{t("policies.convertNote")}</p> : null}
      {alert !== null ? (
        <p role="alert" className="border-b border-border px-4 py-2 text-[13px] text-destructive">
          {alert}
        </p>
      ) : null}
      {jsonError ? <p role="alert" className="border-b border-border px-4 py-2 text-[13px] text-destructive">{jsonError}</p> : null}
      <div className="flex min-h-0 flex-1">
        {view === "canvas" ? (
        <PolicyNodeLibrary canWrite={canWrite} toolGroups={toolGroups} toolNames={toolNames} analyses={analyses} setNodes={setNodes} />
        ) : null}
        <div className="flex min-w-0 flex-1" onDragOver={(event) => event.preventDefault()} onDrop={view === "canvas" ? onDrop : undefined}>
          {view === "json" ? (
            <PolicyJsonView builder={builder} canWrite={canWrite} />
          ) : view === "form" ? (
            <PolicyForm nodes={nodes} edges={edges} disabled={!canWrite} onChange={updateNode} />
          ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection: Connection) => {
              if (!canWrite) return;
              setEdges((currentEdges) => addEdge({ ...connection, id: `edge_${crypto.randomUUID().slice(0, 8)}` }, currentEdges));
            }}
            onSelectionChange={({ nodes: selectedNodes }) => setSelected(selectedNodes[0]?.id ?? null)}
            nodeTypes={nodeTypes}
            fitView
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            deleteKeyCode={canWrite ? ["Backspace", "Delete"] : null}
            nodesDraggable={canWrite}
            nodesConnectable={canWrite}
            elementsSelectable
            className="min-w-0 flex-1"
          >
            <Background gap={18} />
            <Controls showInteractive={false} />
          </ReactFlow>
          )}
        </div>
        {view === "canvas" ? (
        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-border p-4 md:block">
          <h2 className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{t("policies.properties")}</h2>
          {current ? (
            <NodeInspector
              node={current}
              agents={agents}
              tools={toolNames}
              groups={toolGroups}
              fields={conditionFields}
              hasTool={conditionTools.length > 0}
              disabled={!canWrite}
              onChange={(patch) => updateNode(current.id, patch)}
              onDuplicate={() =>
                setNodes((currentNodes) =>
                  currentNodes.concat({
                    ...current,
                    id: `${current.data.kind}_${crypto.randomUUID().slice(0, 8)}`,
                    position: { x: current.position.x + 32, y: current.position.y + 32 },
                    selected: false,
                  })
                )
              }
              onDelete={() => {
                setNodes((currentNodes) => currentNodes.filter((node) => node.id !== current.id));
                setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== current.id && edge.target !== current.id));
                setSelected(null);
              }}
            />
          ) : (
            <p className="mt-3 text-[13px] text-muted-foreground">{t("policies.noSelection")}</p>
          )}
        </aside>
        ) : null}
      </div>
      {panel ? (
        <section className="max-h-[220px] overflow-y-auto border-t border-border px-4 py-3">
          {panel === "validation" ? <ValidationReport report={builder.state.report} /> : (
            <PolicyTestPanel builder={builder} toolNames={toolNames} toolGroups={toolGroups} />
          )}
        </section>
      ) : null}
    </div>
    </AgentContext.Provider>
  );
}
