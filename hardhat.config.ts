import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env" });

const config: HardhatUserConfig = {
  defaultNetwork: "localhost",

  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: true
    }
  },
  networks: {
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    dogechain_testnet: {
      url: process.env.DOGECHAIN_RPC_URL || "https://rpc-testnet.dogechain.dog",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 568,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    }
  }
};

export default config;
