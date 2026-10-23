"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase/browser";

export interface FeedItem {
  submission_id: string;
  team_name: string;
  approved_at: string;
}

export type FeedStatus = "offline" | "connecting" | "live" | "reconnecting";

const POLL_MS = 15_000;
/** re-read a little behind the cursor: commits can land slightly out of order */
const OVERLAP_MS = 15_000;

/**
 * Approved-photo feed for the big screen.
 * - Realtime INSERTs on `screen_feed` (anon can read only approved rows there)
 * - backfill on every (re)subscribe + periodic polling, so nothing is missed
 *   across reconnects
 * - de-duplicated by id; DELETEs (photo pulled by a moderator) are reported
 *   so the queue can drop them
 * The arena keeps working if any of this fails.
 */
export function useScreenFeed(onItem: (item: FeedItem) => void, onPulled: (id: string) => void) {
  const [status, setStatus] = useState<FeedStatus>("offline");
  const [total, setTotal] = useState<number | null>(null);
  const handlers = useRef({ onItem, onPulled });
  handlers.current = { onItem, onPulled };

  useEffect(() => {
    const supabase = browserClient();
    if (!supabase) return;
    let alive = true;
    let cursor: string | null = null;
    const seen = new Set<string>();
    let channel: RealtimeChannel | null = null;

    const accept = (item: FeedItem) => {
      if (!alive || seen.has(item.submission_id)) return;
      seen.add(item.submission_id);
      if (!cursor || item.approved_at > cursor) cursor = item.approved_at;
      setTotal((n) => (n ?? 0) + 1);
      handlers.current.onItem(item);
    };

    const backfill = async () => {
      if (!cursor) return;
      const since = new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString();
      const { data, error } = await supabase
        .from("screen_feed")
        .select("submission_id, team_name, approved_at")
        .gt("approved_at", since)
        .order("approved_at", { ascending: true })
        .limit(25);
      if (!error) data?.forEach(accept);
    };

    const start = async () => {
      setStatus("connecting");
      // only photos approved from now on are announced; existing ones are history
      const [{ data: latest, error }, { count }] = await Promise.all([
        supabase.from("screen_feed").select("submission_id, approved_at").order("approved_at", { ascending: false }).limit(25),
        supabase.from("screen_feed").select("submission_id", { count: "exact" }).limit(1),
      ]);
      if (!alive) return;
      if (error) {
        setStatus("reconnecting");
        cursor = new Date().toISOString();
      } else {
        latest?.forEach((r) => seen.add(r.submission_id));
        cursor = latest?.[0]?.approved_at ?? new Date(0).toISOString();
        setTotal(count ?? 0);
      }

      channel = supabase
        .channel("screen-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "screen_feed" }, (p) => accept(p.new as FeedItem))
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "screen_feed" }, (p) => {
          const id = (p.old as Partial<FeedItem>).submission_id;
          if (id) handlers.current.onPulled(id);
        })
        .subscribe((s) => {
          if (!alive) return;
          if (s === "SUBSCRIBED") {
            setStatus("live");
            void backfill(); // catch anything approved while we were disconnected
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("reconnecting");
        });
    };

    void start();
    const poll = setInterval(() => void backfill(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return { status, total };
}
