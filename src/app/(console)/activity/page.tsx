"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuditLog } from "@/components/activity/activity-timeline";
import { QueryGate } from "@/components/layout/query-gate";
import { useConsole } from "@/hooks/use-console";
import { useEntitlements } from "@/hooks/use-entitlements";
import { addOlderPage, mergeEvents, olderCursor, type OlderPages } from "@/lib/activity-pages";
import { fetchOlderActivity } from "@/lib/api";
import type { ActivityEvent } from "@/types";

const NO_EVENTS: ActivityEvent[] = [];

export default function ActivityPage() {
  const search = useSearchParams();
  const { data, isPending, isError } = useConsole();
  const { auditFull } = useEntitlements();
  const live = data?.events ?? NO_EVENTS;
  const [older, setOlder] = useState<OlderPages<ActivityEvent> | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // The first page refreshes on its own. Once older pages are loaded, keep every row it has
  // shown, so rows that new activity pushes off it stay between it and the older pages.
  const [seenLive, setSeenLive] = useState(live);
  if (live !== seenLive) {
    setSeenLive(live);
    if (older) setOlder({ ...older, events: mergeEvents(older.events, live) });
  }

  const cursor = olderCursor(older, data?.activityNext ?? null);
  const events = useMemo(() => (older ? mergeEvents(older.events, live) : live), [live, older]);

  async function loadOlder() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchOlderActivity(cursor, data?.agents ?? []);
      setOlder((state) => addOlderPage(state, live, page));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <QueryGate isPending={isPending && !data} isError={isError && !data}>
      <div className="px-4 py-5 md:px-8 md:py-6">
        <AuditLog
          events={events}
          urlQuery={search.get("q") ?? ""}
          focusEvent={search.get("event") ?? ""}
          detailed={auditFull}
          older={{ available: Boolean(cursor), loading, failed, load: () => void loadOlder() }}
        />
      </div>
    </QueryGate>
  );
}
