import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { sessionClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  // a cross-site form must not be able to log the moderator out mid-event
  if (!isSameOrigin(req)) return NextResponse.json({ ok: false, message: "Bad origin" }, { status: 403 });
  const supabase = await sessionClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/admin/login", req.url), { status: 303 });
}
