"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import s from "./admin.module.css";

export interface QueueItem {
  id: string;
  team: string;
  status: "pending" | "approved" | "rejected";
  url: string | null;
  createdAt: string;
}

const REFRESH_MS = 5000;
// signed URLs change on every refresh; keep the first one so images don't reload
const URL_TTL_MS = 8 * 60 * 1000;

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

export function ModerationQueue({ pending, recent }: { pending: QueueItem[]; recent: QueueItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef(new Map<string, { url: string; at: number }>());
  const stableUrl = (item: QueueItem) => {
    const hit = urls.current.get(item.id);
    if (hit && Date.now() - hit.at < URL_TTL_MS) return hit.url;
    if (item.url) urls.current.set(item.id, { url: item.url, at: Date.now() });
    return item.url;
  };

  // poll for new submissions (server component re-renders with fresh signed URLs)
  useEffect(() => {
    const id = setInterval(() => startTransition(() => router.refresh()), REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `HTTP ${res.status}`);
      setHidden((h) => new Set(h).add(id));
      startTransition(() => router.refresh());
    } catch (e) {
      setError(`Could not ${decision === "approved" ? "approve" : "reject"}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const visible = pending.filter((p) => !hidden.has(p.id));

  return (
    <>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <h2 className={s.section}>
        PENDING <span className={s.count}>{visible.length}</span>
      </h2>
      {visible.length === 0 ? (
        <p className={s.empty}>Nothing waiting. New photos appear here automatically.</p>
      ) : (
        <div className={s.grid}>
          {visible.map((p) => (
            <article key={p.id} className={s.item} data-testid="pending-item">
              {stableUrl(p) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stableUrl(p)!} alt={`Photo from ${p.team}`} className={s.photo} />
              ) : (
                <div className={s.photo}>NO PREVIEW</div>
              )}
              <div className={s.meta}>
                <b>{p.team}</b>
                <span>{ago(p.createdAt)}</span>
              </div>
              <div className={s.actions}>
                <button className={s.approve} disabled={busy === p.id} onClick={() => decide(p.id, "approved")}>
                  ✓ APPROVE
                </button>
                <button className={s.reject} disabled={busy === p.id} onClick={() => decide(p.id, "rejected")}>
                  ✕ REJECT
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className={s.section}>RECENT DECISIONS</h2>
      {recent.length === 0 ? (
        <p className={s.empty}>No decisions yet.</p>
      ) : (
        <div className={s.recent}>
          {recent.map((r) => (
            <div key={r.id} className={s.recentItem}>
              {stableUrl(r) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={stableUrl(r)!} alt="" className={s.thumb} />
              )}
              <span className={r.status === "approved" ? s.tagOk : s.tagNo}>{r.status.toUpperCase()}</span>
              <span>{r.team}</span>
              {r.status === "approved" && (
                <button className={s.ghost} disabled={busy === r.id} onClick={() => decide(r.id, "rejected")}>
                  PULL FROM SCREEN
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
