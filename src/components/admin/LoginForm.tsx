"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/browser";
import s from "./admin.module.css";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = browserClient();
    if (!supabase) return setError("Supabase is not configured.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("Wrong email or password.");
    // full navigation so the server renders with the fresh auth cookies
    window.location.assign("/admin");
  };

  return (
    <main className={s.page}>
      <form className={s.login} onSubmit={submit}>
        <h1 className={s.title}>
          ADMIN <em>SIGN IN</em>
        </h1>
        <label className={s.label}>
          EMAIL
          <input className={s.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" />
        </label>
        <label className={s.label}>
          PASSWORD
          <input
            className={s.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <button className={s.approve} disabled={busy}>
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </form>
    </main>
  );
}
