import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

/** Per-request client acting as the signed-in user (RLS applies). */
export async function sessionClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component: middleware refreshes the session instead
        }
      },
    },
  });
}

/** Resolves the current user and whether they are an admin (checked in the DB). */
export async function currentAdmin() {
  const supabase = await sessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isAdmin: false } as const;
  const { data } = await supabase.rpc("is_admin");
  return { supabase, user, isAdmin: data === true } as const;
}
