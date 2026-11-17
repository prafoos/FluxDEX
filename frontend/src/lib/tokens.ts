import { isAddress } from "viem";
import deployment from "@/constants/contracts.json";
import type { Token } from "@/types";

const addressOf = (value: string): `0x${string}` | undefined =>
  isAddress(value) ? value : undefined;

const qmsTokens: Token[] = [
  { name: "QMS", symbol: "QMS", decimals: 18, native: true },
  {
    name: "Wrapped QMS",
    symbol: "WQMS",
    decimals: 18,
    address: addressOf(deployment.addresses.WQMS),
  },
  {
    name: "Test USDC",
    symbol: "tUSDC",
    decimals: 18,
    address: addressOf(deployment.addresses.TestUSDC),
  },
  {
    name: "Test USDT",
    symbol: "tUSDT",
    decimals: 18,
    address: addressOf(deployment.addresses.TestUSDT),
  },
  {
    name: "Tether USD",
    symbol: "USDT",
    decimals: 6,
    address: addressOf("0x5D1386fC130143F92511bC2D18124D3E414ed429"),
  },
  {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 6,
    address: addressOf("0xDd4D61DF875cc613E1372c78827a5F4C2741bf11"),
  },
  {
    name: "Wrapped Ether",
    symbol: "WETH",
    decimals: 18,
    address: addressOf("0x43D7c8434A5290a32C8725224870ad6f85132a31"),
  },
  {
    name: "Wrapped Bitcoin",
    symbol: "WBTC",
    decimals: 8,
    address: addressOf("0x5eBfE302200a5b22E182a5C0D10444Fe44b2A678"),
  },
  {
    name: "Wrapped QMS",
    symbol: "WQMS",
    decimals: 18,
    address: addressOf("0x9AA510295aC664A3d5A3182a3eFe959DE2B12c34"),
  },
];

export const tokens = qmsTokens.filter((token) => token.native || token.address);
export const customTokensStorageKey = "qms-dex:custom-tokens";

export function sameToken(left: Token, right: Token): boolean {
  return left.native === right.native &&
    left.address?.toLowerCase() === right.address?.toLowerCase();
}

export const routerAddress = addressOf(deployment.addresses.DEXRouter);
export const factoryAddress = addressOf(deployment.addresses.DEXFactory);
export const wqmsAddress = addressOf(deployment.addresses.WQMS);
export const deploymentReady = Boolean(
  routerAddress && factoryAddress && wqmsAddress &&
  addressOf(deployment.addresses.TestUSDC) && addressOf(deployment.addresses.TestUSDT),
);
