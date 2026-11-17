import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config({ path: ".env" });
dotenv.config({ path: "../.env" });

const privateKey = process.env.PRIVATE_KEY;
const accounts = privateKey ? [privateKey] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    qmsTestnet: {
      url: process.env.QMS_TESTNET_RPC || process.env.QMS_TESTNET_RPC_URL || "https://rpc.testnet.qms.finance",
      chainId: 19480,
      accounts,
    },
  },
  etherscan: {
    apiKey: { qmsTestnet: process.env.QMSSCAN_API_KEY || "not-required" },
    customChains: [{
      network: "qmsTestnet",
      chainId: 19480,
      urls: {
        apiURL: "https://testnet.qmsscan.io/api",
        browserURL: process.env.QMS_TESTNET_EXPLORER_URL || "https://testnet.qmsscan.io",
      },
    }],
  },
};

export default config;
