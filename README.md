# FluxDEX

FluxDEX is a testnet AMM dApp for QMS Network (EVM, chain ID `19480`). It contains a Solidity/Hardhat workspace and a Next.js App Router frontend. **This is experimental testnet software, not audited, and must not be used with real funds.** The faucet token contracts are permissionless test assets.

The installed dependency tree currently reports transitive npm advisories (including high-severity issues) in the RainbowKit/Wagmi connector graph. Non-breaking `npm audit fix` does not resolve them; forcing the available fixes would cross the peer-supported Wagmi/Next.js major versions. Review and upgrade that dependency graph, then complete a security audit before any real-fund use.

## Requirements

- Node.js 20 or newer and npm
- A QMS Testnet wallet with test QMS for deployment/transactions
- A wallet project ID for WalletConnect if using WalletConnect (optional for injected wallets)

## Install

From the repository root:

```bash
npm install
copy .env.example .env
```

Set `PRIVATE_KEY` in `.env` to the deployer account's testnet private key. Never commit `.env` or use a mainnet key. You can also copy `contracts/.env.example` to `contracts/.env`; Hardhat reads either location and uses `QMS_TESTNET_RPC` (default `https://rpc.testnet.qms.finance`). Hardhat uses HTTP RPC; the frontend's chain config also includes the QMS WebSocket endpoint.

## Compile and test contracts

```bash
npm run compile
npm test
```

The tests cover pair deployment, LP mint/burn, swap quoting and execution, 0.30% fee math, minimum-output/deadline reverts, WQMS, QMS swaps, and the mock-token faucet.

## Deploy and verify on QMS Testnet

Fund the deployer with test QMS, then run:

```bash
npm run deploy:testnet
```

The script deploys WQMS, the factory, router and tUSDC/tUSDT, seeds the QMS/token and token/token pools, and writes addresses and contract ABIs to `frontend/src/constants/contracts.json`. It seeds each native-token pool with `0.5 QMS` and requires a `1.5 QMS` balance, reserving `0.5 QMS` for deployment gas.

To verify deployed contracts with the QMSScan-compatible Hardhat verifier, provide `QMSSCAN_API_KEY` if required by the explorer and run:

```bash
npm run verify:testnet --workspace contracts
```

Verification is best-effort only if the explorer does not expose a compatible verification API. Contract addresses and constructor arguments are read from the deployment JSON.

## Run the frontend

```bash
cd frontend
copy .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `frontend/.env.local` for WalletConnect; browser-injected wallets can connect without it. The app prompts connected wallets to switch to QMS Testnet. Deploy contracts first to enable swaps, liquidity, and faucet actions.

The token picker includes five verified QMS Testnet assets and supports importing other ERC-20 contracts by address; imported tokens are saved in browser local storage. The Faucet tab always links to the official QMS Testnet gas faucet, while tUSDC/tUSDT mint buttons appear once those contracts have been deployed.

Production build and typecheck:

```bash
npm run typecheck --workspace frontend
npm run build
```

## Network details

| Setting | Value |
|---|---|
| Network | QMS Testnet |
| Chain ID | `19480` (`0x4c18`) |
| Currency | QMS |
| HTTP RPC | `https://rpc.testnet.qms.finance` |
| WebSocket RPC | `wss://rpc.testnet.qms.finance` |
| Explorer | `https://testnet.qmsscan.io` |

## Contract notes

- Swaps use the constant-product invariant with a 0.30% input fee.
- The pair is non-upgradeable; its lock protects pair state-changing operations against reentrancy.
- The 0.30% swap fee remains in pool reserves for liquidity providers; no protocol fee is taken.
- `MockERC20.faucet()` intentionally has no rate limit on this testnet-only mock contract.
