import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "FluxDEX — Decentralized Exchange",
  description: "Swap tokens and provide liquidity with FluxDEX on QMS Testnet.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
