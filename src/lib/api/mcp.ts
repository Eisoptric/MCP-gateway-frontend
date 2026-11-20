import { del, get, patch, post } from "./transport";

export function deleteMcpServer(id: string) {
  return del(`/mcp-servers/${id}`);
}

export interface ApiMcpServer {
  id: string;
  name: string;
  endpoint: string;
  status: string;
  connected?: boolean;
  gateway?: string;
  organization_id?: string | null;
  tools: string[];
  catalog?: { id: string; name: string; description?: string }[];
  has_authorization?: boolean;
  secret_status?: "ok" | "needs_reconnect" | "none";
}

export interface ApiToolSetItem {
  tool_id: string;
  name: string;
  description?: string;
  server_id?: string | null;
  server_name?: string;
  approval?: boolean;
  input_schema?: Record<string, unknown>;
}

export interface ApiToolSet {
  id: string;
  name: string;
  description?: string;
  items: ApiToolSetItem[];
}

export function fetchMcpServers() {
  return get<ApiMcpServer[]>("/mcp-servers");
}

export function connectMcpServer(body: { name: string; endpoint: string; authorization?: string }) {
  return post<ApiMcpServer>("/mcp-servers", body);
}

export function startMcpOauth(body: { name: string; endpoint: string; nonce: string }) {
  return post<{ authorization_url?: string | null; server?: ApiMcpServer | null }>("/mcp-servers/oauth/start", body);
}

export interface ApiMcpOauthAttempt {
  status: "pending" | "connected" | "failed" | "expired";
  reason?: string | null;
  message?: string | null;
  expires_at: string;
}

/** How the sign-in this member started with `nonce` stands. 404 for anyone else's. */
export function fetchMcpOauthAttempt(nonce: string) {
  return get<ApiMcpOauthAttempt>(`/mcp-servers/oauth/attempts/${encodeURIComponent(nonce)}`);
}

export function refreshMcpServer(id: string) {
  return post<ApiMcpServer>(`/mcp-servers/${id}/refresh`);
}

export function createToolSet(body: {
  name: string;
  description?: string;
  items: { tool_id: string; approval: boolean }[];
}) {
  return post<ApiToolSet>("/tool-sets", body);
}

export function updateToolSet(
  id: string,
  body: {
    name?: string;
    description?: string;
    items?: { tool_id: string; approval: boolean }[];
  }
) {
  return patch<ApiToolSet>(`/tool-sets/${id}`, body);
}

export function deleteToolSet(id: string) {
  return del(`/tool-sets/${id}`);
}

export interface ApiMcpAllowedHost {
  id: string;
  host: string;
  created_by_user_id: string;
  created_at: string;
  /** Connections on this host. They stop working when it is removed. */
  servers: number;
}

export interface ApiMcpAllowedHosts {
  hosts: ApiMcpAllowedHost[];
  /** Approved by Eisoptric for every organization. */
  builtin: string[];
  limit: number;
}

/** Hosts this organization's admins approved for MCP servers. Needs team.read. */
export function fetchMcpAllowedHosts() {
  return get<ApiMcpAllowedHosts>("/mcp-servers/allowed-hosts");
}

/** Needs team.write and a recent sign-in: the API answers 403 "Reauthentication required" otherwise. */
export function addMcpAllowedHost(host: string) {
  return post<ApiMcpAllowedHost>("/mcp-servers/allowed-hosts", { host });
}

export function removeMcpAllowedHost(id: string) {
  return del(`/mcp-servers/allowed-hosts/${encodeURIComponent(id)}`);
}
