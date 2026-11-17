import type { Address } from "viem";

export type Token = {
  address?: Address;
  name: string;
  symbol: string;
  decimals: number;
  native?: boolean;
};

export type ToastState = {
  kind: "success" | "error" | "info";
  message: string;
  hash?: `0x${string}`;
};
