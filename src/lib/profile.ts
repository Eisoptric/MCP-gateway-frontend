import type { Agent } from "@/types";

export function profileIdentity(input: {
  userId: string;
  organizationId: string;
  kind?: string | null;
  plan?: string | null;
}): string {
  const kind = (input.kind || "").trim().toLowerCase();
  const personal =
    kind === "personal" ||
    (kind !== "organization" && (input.plan || "free") !== "enterprise");
  if (personal) return input.userId;
  return `${input.organizationId}:${input.userId}`;
}

export function gatewayMcpAgents(agents: Agent[], identity: string): Agent[] {
  if (!identity) return [];
  return agents.filter((agent) => agent.origin === "gateway_mcp" && agent.profileId === identity);
}
