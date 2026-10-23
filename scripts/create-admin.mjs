// Create (or promote) a moderator account — without putting secrets in shell
// history, process lists or files.
//
//   node scripts/create-admin.mjs                      # prompts for everything
//   node scripts/create-admin.mjs you@example.com      # email may be an argument
//   node --env-file=.env.local scripts/create-admin.mjs  # local dev: URL + key from the env file
//
// Prompts (hidden input) for the Supabase secret key if SUPABASE_SECRET_KEY is
// not set, and ALWAYS prompts for the password (twice). Passwords are never
// accepted as arguments or environment variables.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const MIN_PASSWORD = 12;

if (!stdin.isTTY) {
  console.error("Run this in an interactive terminal (passwords are typed at a hidden prompt).");
  process.exit(1);
}
if (process.argv.length > 3) {
  console.error("Only the email may be passed as an argument. Never put passwords on the command line.");
  process.exit(1);
}

async function ask(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/** read a line without echoing it (handles paste, backspace and Ctrl-C) */
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = "";
    const done = (fn) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      fn();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => process.exit(130));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || (await ask("Supabase project URL (https://<ref>.supabase.co): "));
if (!/^https?:\/\/[^\s]+$/.test(url)) {
  console.error("That doesn't look like a URL.");
  process.exit(1);
}
const key =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || (await askHidden("Supabase secret key (hidden): "));
if (!key) {
  console.error("A secret (service_role) key is required.");
  process.exit(1);
}

const email = (process.argv[2] || (await ask("Admin email: "))).toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error("That doesn't look like an email address.");
  process.exit(1);
}

const password = await askHidden(`Password for ${email} (hidden, ${MIN_PASSWORD}+ chars): `);
if (password.length < MIN_PASSWORD) {
  console.error(`Password must be at least ${MIN_PASSWORD} characters.`);
  process.exit(1);
}
if ((await askHidden("Repeat password: ")) !== password) {
  console.error("Passwords do not match.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

let userId;
const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (created.error) {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error(`Could not reach Supabase Auth: ${error.message}`);
    process.exit(1);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!existing) {
    console.error(`Could not create user: ${created.error.message}`);
    process.exit(1);
  }
  const answer = await ask(`${email} already exists. Reset its password and make it an admin? [y/N] `);
  if (answer.toLowerCase() !== "y") {
    console.log("Nothing changed.");
    process.exit(0);
  }
  userId = existing.id;
  const upd = await db.auth.admin.updateUserById(userId, { password });
  if (upd.error) {
    console.error(`Could not update password: ${upd.error.message}`);
    process.exit(1);
  }
} else userId = created.data.user.id;

const { error } = await db.from("admins").upsert({ user_id: userId });
if (error) {
  console.error(`User exists but could not be made admin: ${error.message}`);
  process.exit(1);
}
console.log(`✓ ${email} is an admin.`);
