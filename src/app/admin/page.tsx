import { redirect } from "next/navigation";
import { ModerationQueue, type QueueItem } from "@/components/admin/ModerationQueue";
import { PHOTO_BUCKET, supabaseConfigured } from "@/lib/supabase/env";
import { currentAdmin } from "@/lib/supabase/server";
import s from "@/components/admin/admin.module.css";

export const metadata = { title: "Moderation — Realm Hack '26" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!supabaseConfigured)
    return (
      <main className={s.page}>
        <p className={s.notice}>Supabase is not configured. See README → Setup.</p>
      </main>
    );

  const { supabase, user, isAdmin } = await currentAdmin();
  if (!user) redirect("/admin/login");
  if (!isAdmin)
    return (
      <main className={s.page}>
        <p className={s.notice}>{user.email} is signed in but is not an admin.</p>
        <form action="/api/admin/signout" method="post">
          <button className={s.ghost}>SIGN OUT</button>
        </form>
      </main>
    );

  // RLS: these selects only succeed because the user is in `admins`
  const [pending, recent] = await Promise.all([
    supabase
      .from("submissions")
      .select("id, photo_path, status, width, height, created_at, teams(name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50),
    supabase
      .from("submissions")
      .select("id, photo_path, status, width, height, created_at, reviewed_at, teams(name)")
      .neq("status", "pending")
      .order("reviewed_at", { ascending: false })
      .limit(12),
  ]);

  const rows = [...(pending.data ?? []), ...(recent.data ?? [])];
  // short-lived signed URLs, issued under the admin's own storage policy
  const signed = rows.length
    ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(
        rows.map((r) => r.photo_path),
        600,
      )
    : { data: [] };
  const urlFor = new Map((signed.data ?? []).map((x) => [x.path, x.signedUrl]));

  const toItem = (r: (typeof rows)[number]): QueueItem => ({
    id: r.id,
    team: (r.teams as unknown as { name: string } | null)?.name ?? "?",
    status: r.status,
    url: urlFor.get(r.photo_path) ?? null,
    createdAt: r.created_at,
  });

  return (
    <main className={s.page}>
      <header className={s.head}>
        <h1 className={s.title}>
          MODERATION <em>QUEUE</em>
        </h1>
        <div className={s.who}>
          {user.email}
          <form action="/api/admin/signout" method="post">
            <button className={s.ghost}>SIGN OUT</button>
          </form>
        </div>
      </header>
      <ModerationQueue pending={(pending.data ?? []).map(toItem)} recent={(recent.data ?? []).map(toItem)} />
    </main>
  );
}
