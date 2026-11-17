import { ethers, artifacts } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying QMS DEX with ${deployer.address}`);
  const qmsLiquidity = ethers.parseEther("0.5");
  const minimumBalance = qmsLiquidity * 2n + ethers.parseEther("0.5");
  if (await ethers.provider.getBalance(deployer.address) < minimumBalance) {
    throw new Error(`Deployer needs at least ${ethers.formatEther(minimumBalance)} QMS for seed liquidity and deployment gas.`);
  }

  const Wrapped = await ethers.getContractFactory("WQMS");
  const wqms = await Wrapped.deploy();
  await wqms.waitForDeployment();

  const Factory = await ethers.getContractFactory("DEXFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Router = await ethers.getContractFactory("DEXRouter");
  const router = await Router.deploy(await factory.getAddress(), await wqms.getAddress());
  await router.waitForDeployment();

  const initialSupply = ethers.parseUnits("1000000", 18);
  const faucetAmount = ethers.parseUnits("10000", 18);
  const Token = await ethers.getContractFactory("MockERC20");
  const usdc = await Token.deploy("Test USDC", "tUSDC", initialSupply, faucetAmount);
  const usdt = await Token.deploy("Test USDT", "tUSDT", initialSupply, faucetAmount);
  await Promise.all([usdc.waitForDeployment(), usdt.waitForDeployment()]);

  const tokenLiquidity = ethers.parseUnits("10000", 18);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
  const seed = async (token: typeof usdc) => {
    await (await token.approve(await router.getAddress(), tokenLiquidity)).wait();
    await (await router.addLiquidityQMS(
      await token.getAddress(), tokenLiquidity, 0, 0, deployer.address, deadline,
      { value: qmsLiquidity },
    )).wait();
  };
  await seed(usdc);
  await seed(usdt);

  await (await usdc.approve(await router.getAddress(), tokenLiquidity)).wait();
  await (await usdt.approve(await router.getAddress(), tokenLiquidity)).wait();
  await (await router.addLiquidity(
    await usdc.getAddress(), await usdt.getAddress(),
    tokenLiquidity, tokenLiquidity, 0, 0, deployer.address, deadline,
  )).wait();

  const addresses = {
    WQMS: await wqms.getAddress(),
    DEXFactory: await factory.getAddress(),
    DEXRouter: await router.getAddress(),
    TestUSDC: await usdc.getAddress(),
    TestUSDT: await usdt.getAddress(),
  };
  const abiNames = ["WQMS", "DEXFactory", "DEXRouter", "MockERC20", "DEXPair"];
  const abis: Record<string, unknown> = {};
  for (const name of abiNames) {
    abis[name] = (await artifacts.readArtifact(name)).abi;
  }
  const deployment = {
    chainId: 19480,
    networkName: "QMS Testnet",
    explorerUrl: "https://testnet.qmsscan.io",
    addresses,
    tokens: [
      { address: addresses.TestUSDC, name: "Test USDC", symbol: "tUSDC", decimals: 18 },
      { address: addresses.TestUSDT, name: "Test USDT", symbol: "tUSDT", decimals: 18 },
    ],
    abis,
    deployedAt: new Date().toISOString(),
  };
  const output = path.resolve(__dirname, "../../frontend/src/constants/contracts.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log("Deployment addresses and ABIs saved to frontend/src/constants/contracts.json");
  console.table(addresses);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
