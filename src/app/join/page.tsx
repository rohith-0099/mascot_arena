import type { Metadata, Viewport } from "next";
import { JoinClient } from "@/components/join/JoinClient";

export const metadata: Metadata = { title: "Join the Arena — Realm Hack '26" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07080b" };

export default function JoinPage() {
  return <JoinClient />;
}
