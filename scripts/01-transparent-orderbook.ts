import { ethers } from "hardhat";
import { TransparentOrderBook } from "../typechain-types";

async function main() {
  console.log("Starting TransparentOrderBook deployment...");
  
  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log("Deployment Details:");
  console.log("  Network:", network.name, `(Chain ID: ${network.chainId})`);
  console.log("  Deployer:", deployer.address);
  console.log("  Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");
  
  // Deploy TransparentOrderBook
  console.log("\nDeploying TransparentOrderBook...");
  
  const TransparentOrderBookFactory = await ethers.getContractFactory("TransparentOrderBook");
  const transparentOrderBook = await TransparentOrderBookFactory.deploy() as TransparentOrderBook;
  
  await transparentOrderBook.waitForDeployment();
  const contractAddress = await transparentOrderBook.getAddress();
  
  console.log("TransparentOrderBook deployed!");
  console.log("  Contract Address:", contractAddress);
  
  // Verify deployment by calling a view function
  console.log("\nVerifying deployment...");
  try {
    const orderCount = await transparentOrderBook.orderCount();
    console.log("  Initial order count:", orderCount.toString());
    console.log("  Owner:", await transparentOrderBook.owner());
    console.log("Contract verification successful!");
  } catch (error) {
    console.error("Contract verification failed:", error);
    return;
  }
  
  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    contractAddress: contractAddress,
    deployer: deployer.address,
    blockNumber: await ethers.provider.getBlockNumber(),
    timestamp: new Date().toISOString(),
    gasUsed: "N/A", // Will be updated by deployment transaction
  };
  
  console.log("\nDeployment Summary:");
  console.table(deploymentInfo);
  
  // Save to file for frontend integration
  const fs = require('fs');
  const path = require('path');
  
  const deploymentPath = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentPath)) {
    fs.mkdirSync(deploymentPath, { recursive: true });
  }
  
  fs.writeFileSync(
    path.join(deploymentPath, `transparent-orderbook-${network.name}-${network.chainId}.json`),
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`\nDeployment info saved to: deployments/transparent-orderbook-${network.name}-${network.chainId}.json`);
}

// Error handling
main()
  .then(() => {
    console.log("\nDeployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nDeployment failed:");
    console.error(error);
    process.exit(1);
  });