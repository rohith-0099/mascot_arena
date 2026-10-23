import { NextResponse } from "next/server";
import { PHOTO_BUCKET } from "@/lib/supabase/env";
import { serviceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Streams an APPROVED photo to the big screen. The bucket is private; this is
 * the only public path to a photo, and it checks `screen_feed` (approved-only)
 * on every request, so pending, rejected or pulled photos return 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = serviceClient();
  if (!db) return new NextResponse(null, { status: 503 });
  if (!UUID_RE.test(id)) return new NextResponse(null, { status: 404 });

  const { data: feed } = await db.from("screen_feed").select("submission_id").eq("submission_id", id).maybeSingle();
  if (!feed) return new NextResponse(null, { status: 404 });

  const { data: sub } = await db.from("submissions").select("photo_path, status").eq("id", id).single();
  if (!sub || sub.status !== "approved") return new NextResponse(null, { status: 404 });

  const { data: file, error } = await db.storage.from(PHOTO_BUCKET).download(sub.photo_path);
  if (error || !file) return new NextResponse(null, { status: 404 });

  return new NextResponse(file.stream(), {
    headers: {
      "content-type": sub.photo_path.endsWith(".webp") ? "image/webp" : "image/jpeg",
      // short and private: a pulled photo stops being served within a minute
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
