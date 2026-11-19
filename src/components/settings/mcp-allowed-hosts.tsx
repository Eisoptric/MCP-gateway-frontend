"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ReauthForm } from "@/components/account/reauth-form";
import { Button } from "@/components/ui/button";
import { ApiError, addMcpAllowedHost, fetchMcpAllowedHosts, removeMcpAllowedHost, type ApiMcpAllowedHost } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const mcpAllowedHostsQueryKey = ["mcp-allowed-hosts"] as const;

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-base text-foreground outline-none focus:border-ring md:text-[13px]";

/**
 * Hosts this organization's admins approve for MCP servers, beside the ones Saturn approves for
 * everyone. Adding one widens where Saturn sends requests, so the API asks for a fresh sign-in.
 */
export function McpAllowedHosts({ canEdit }: { canEdit: boolean }) {
  const { t, locale } = useI18n();
  const client = useQueryClient();
  const listed = useQuery({ queryKey: mcpAllowedHostsQueryKey, queryFn: fetchMcpAllowedHosts });
  const [host, setHost] = useState("");
  const [needsReauth, setNeedsReauth] = useState(false);
  const [confirming, setConfirming] = useState<ApiMcpAllowedHost | null>(null);
  const [showBuiltin, setShowBuiltin] = useState(false);

  const add = useMutation({
    mutationFn: (value: string) => addMcpAllowedHost(value),
    onSuccess: async () => {
      setHost("");
      setNeedsReauth(false);
      await client.invalidateQueries({ queryKey: mcpAllowedHostsQueryKey });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403 && error.message === "Reauthentication required") setNeedsReauth(true);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => removeMcpAllowedHost(id),
    onSuccess: async () => {
      setConfirming(null);
      await client.invalidateQueries({ queryKey: mcpAllowedHostsQueryKey });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = host.trim();
    if (value) add.mutate(value);
  }

  const data = listed.data;
  const full = data ? data.hosts.length >= data.limit : false;

  return (
    <div id="mcp-hosts" className="mt-8 scroll-mt-6 border-t border-border pt-6">
      <h2 className="text-[15px] font-medium">{t("settings.mcpHosts.title")}</h2>
      <p className="mt-2 max-w-xl text-[13px] leading-5 text-muted-foreground">{t("settings.mcpHosts.lead")}</p>

      {listed.isError ? (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          {listed.error instanceof ApiError ? listed.error.message : t("common.apiError")}
        </p>
      ) : null}

      {data ? (
        <div className="mt-4 max-w-xl">
          {data.hosts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("settings.mcpHosts.empty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.hosts.map((item) => (
                <li key={item.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="break-all font-mono text-[13px]">{item.host}</div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {t("settings.mcpHosts.servers", { count: item.servers })}
                      {` · ${relativeTime(item.created_at, locale)}`}
                    </div>
                  </div>
                  {canEdit ? (
                    confirming?.id === item.id ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(item.id)}
                        >
                          {t("settings.mcpHosts.confirmRemove")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setConfirming(item)}>
                        {t("settings.mcpHosts.remove")}
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {confirming && confirming.servers > 0 ? (
            <p role="status" className="mt-2 text-[12px] leading-5 text-destructive">
              {t("settings.mcpHosts.removeWarning", { count: confirming.servers })}
            </p>
          ) : null}
          {remove.isError ? (
            <p role="alert" className="mt-2 text-[13px] text-destructive">
              {remove.error instanceof ApiError ? remove.error.message : t("common.apiError")}
            </p>
          ) : null}

          {canEdit ? (
            <form className="mt-4" onSubmit={submit}>
              <label className="block text-[12px] text-muted-foreground" htmlFor="mcp-host-input">
                {t("settings.mcpHosts.add")}
              </label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                <input
                  id="mcp-host-input"
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="mcp.example.com"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={full}
                  className={fieldClass}
                />
                <Button type="submit" className="sm:shrink-0" disabled={!host.trim() || add.isPending || full}>
                  {t("settings.mcpHosts.addAction")}
                </Button>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {full ? t("settings.mcpHosts.full", { limit: data.limit }) : t("settings.mcpHosts.addHint")}
              </p>
              {add.isError && !needsReauth ? (
                <p role="alert" className="mt-2 text-[13px] text-destructive">
                  {add.error instanceof ApiError ? add.error.message : t("common.apiError")}
                </p>
              ) : null}
            </form>
          ) : (
            <p className="mt-4 text-[12px] text-muted-foreground">{t("settings.mcpHosts.adminOnly")}</p>
          )}
          {needsReauth ? (
            <div className="mt-4">
              <p className="text-[13px]">{t("settings.mcpHosts.reauth")}</p>
              <ReauthForm busy={add.isPending} onReady={() => add.mutate(host.trim())} />
            </div>
          ) : null}

          <button
            type="button"
            className="mt-5 text-[12px] text-muted-foreground underline"
            aria-expanded={showBuiltin}
            onClick={() => setShowBuiltin((current) => !current)}
          >
            {t("settings.mcpHosts.builtin", { count: data.builtin.length })}
          </button>
          {showBuiltin ? (
            <ul className="mt-2 columns-1 gap-6 font-mono text-[12px] leading-6 text-muted-foreground sm:columns-2">
              {data.builtin.map((item) => (
                <li key={item} className="break-all">{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
