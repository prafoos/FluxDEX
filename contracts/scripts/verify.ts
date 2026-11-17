import { run } from "hardhat";
import fs from "node:fs";
import path from "node:path";

type Deployment = {
  addresses: Record<string, string>;
};

async function main() {
  const file = path.resolve(__dirname, "../../frontend/src/constants/contracts.json");
  if (!fs.existsSync(file)) throw new Error("Deployment file not found. Run the deployment script first.");
  const deployment = JSON.parse(fs.readFileSync(file, "utf8")) as Deployment;
  const { addresses } = deployment;
  const contracts: Array<{ address: string; args: unknown[]; name: string }> = [
    { name: "WQMS", address: addresses.WQMS, args: [] },
    { name: "DEXFactory", address: addresses.DEXFactory, args: [] },
    { name: "DEXRouter", address: addresses.DEXRouter, args: [addresses.DEXFactory, addresses.WQMS] },
    {
      name: "MockERC20 (tUSDC)",
      address: addresses.TestUSDC,
      args: ["Test USDC", "tUSDC", "1000000000000000000000000", "10000000000000000000000"],
    },
    {
      name: "MockERC20 (tUSDT)",
      address: addresses.TestUSDT,
      args: ["Test USDT", "tUSDT", "1000000000000000000000000", "10000000000000000000000"],
    },
  ];
  for (const contract of contracts) {
    if (!contract.address) throw new Error(`Missing deployment address for ${contract.name}.`);
    console.log(`Verifying ${contract.name} at ${contract.address}`);
    await run("verify:verify", { address: contract.address, constructorArguments: contract.args });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
