"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { qmsTestnet } from "@/constants/chain";

export const wagmiConfig = getDefaultConfig({
  appName: "FluxDEX",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "qms-swap-testnet-project",
  chains: [qmsTestnet],
  ssr: true,
});
