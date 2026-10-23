import Link from "next/link";

const links = [
  { href: "/screen", label: "BIG SCREEN", note: "1920×1080 projector view" },
  { href: "/screen?dev", label: "BIG SCREEN + CONTROLS", note: "operator buttons visible" },
  { href: "/lab", label: "SPRITE LAB", note: "every character × every animation, PNG export" },
];

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 640, width: "100%" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(40px, 9vw, 72px)", lineHeight: 1 }}>
          REALM HACK <span style={{ color: "var(--orange)" }}>&apos;26</span>
        </h1>
        <p style={{ color: "var(--gold)", margin: "12px 0 32px" }}>LIVE MASCOT ARENA</p>
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={{
              display: "block",
              textDecoration: "none",
              padding: "16px 20px",
              marginBottom: 16,
              boxShadow: "inset 0 0 0 4px var(--orange), 6px 6px 0 var(--ink)",
            }}
          >
            {l.label}
            <div style={{ fontSize: 12, color: "#9a8f88", marginTop: 4 }}>{l.note}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
