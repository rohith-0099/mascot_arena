import { NextResponse, type NextRequest } from "next/server";
import { sessionClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { isSameOrigin } from "@/lib/http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Approve / reject a submission. The user's own session is forwarded to the
 * database, where `moderate_submission()` refuses anyone not in `admins`, so
 * this route cannot be used to escalate privileges even if the UI is bypassed.
 */
export async function POST(req: NextRequest) {
  if (!supabaseConfigured) return NextResponse.json({ ok: false, message: "Not configured" }, { status: 503 });

  // cookie-authenticated endpoint: reject cross-site requests (CSRF)
  if (!isSameOrigin(req))
    return NextResponse.json({ ok: false, message: "Bad origin" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { id?: string; decision?: string; reason?: string } | null;
  if (!body?.id || !UUID_RE.test(body.id) || (body.decision !== "approved" && body.decision !== "rejected"))
    return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 });

  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Sign in required" }, { status: 401 });

  const { data, error } = await supabase.rpc("moderate_submission", {
    p_submission_id: body.id,
    p_decision: body.decision,
    p_reason: body.reason?.slice(0, 200) ?? null,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 500;
    if (status === 500) console.error("moderate failed", error);
    return NextResponse.json({ ok: false, message: status === 403 ? "Not an admin" : error.message }, { status });
  }
  return NextResponse.json({ ok: true, id: data.id, status: data.status });
}
