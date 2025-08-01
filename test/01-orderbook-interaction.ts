import { ethers } from "hardhat";
import { TransparentOrderBook, MockERC20 } from "../typechain-types";

// Helper function to convert order status bigint to readable string
function getOrderStatusString(status: bigint): string {
  const statusNames = ["PENDING", "ONGOING", "EXPIRED", "SUCCESS", "CANCELLED"];
  const statusIndex = Number(status);
  return statusNames[statusIndex] || `UNKNOWN(${status})`;
}

async function main() {
  console.log("Testing TransparentOrderBook interactions...");
  
  // Get test accounts
  const [deployer, maker, taker] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  
  console.log("Test Setup:");
  console.log("  Network:", network.name);
  console.log("  Deployer:", deployer.address);
  console.log("  Maker:", maker.address);
  console.log("  Taker:", taker.address);
  
  // Deploy or connect to existing contract
  let transparentOrderBook: TransparentOrderBook;
  let mockUSDC: MockERC20;
  let mockWETH: MockERC20;

  // Try to load from deployment file first
  try {
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = path.join(__dirname, `../deployments/transparent-orderbook-${network.name}-${network.chainId}.json`);
    
    if (fs.existsSync(deploymentFile)) {
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      transparentOrderBook = await ethers.getContractAt("TransparentOrderBook", deployment.contractAddress);
      console.log("Using existing contract at:", deployment.contractAddress);
    } else {
      throw new Error("No deployment found, deploying new contract");
    }
  } catch {
    // Deploy new contract for testing
    console.log("Deploying new contract for testing...");
    const TransparentOrderBookFactory = await ethers.getContractFactory("TransparentOrderBook");
    transparentOrderBook = await TransparentOrderBookFactory.deploy();
    await transparentOrderBook.waitForDeployment();
    console.log("Test contract deployed at:", await transparentOrderBook.getAddress());
  }

  // Deploy mock ERC20 tokens for testing
  console.log("\nDeploying mock tokens for testing...")

  const MockERC20Factory = await ethers.getContractFactory("MockERC20");

  // Deploy mock USDC
  mockUSDC = await MockERC20Factory.deploy("Mock USDC", "USDC", 6);
  await mockUSDC.waitForDeployment();
  const USDC_ADDRESS = await mockUSDC.getAddress();
  
  // Deploy mock WETH
  mockWETH = await MockERC20Factory.deploy("Mock WETH", "WETH", 18);
  await mockWETH.waitForDeployment();
  const WETH_ADDRESS = await mockWETH.getAddress();
  
  console.log("Mock tokens deployed:");
  console.log("  USDC:", USDC_ADDRESS);
  console.log("  WETH:", WETH_ADDRESS);
  
  // Mint tokens to maker for testing
  console.log("\nMinting tokens to maker...");
  await mockUSDC.mint(maker.address, ethers.parseUnits("10000", 6)); // 10,000 USDC
  await mockWETH.mint(maker.address, ethers.parseEther("10")); // 10 WETH
  
  console.log("Tokens minted:");
  console.log("  Maker USDC balance:", ethers.formatUnits(await mockUSDC.balanceOf(maker.address), 6), "USDC");
  console.log("  Maker WETH balance:", ethers.formatEther(await mockWETH.balanceOf(maker.address)), "WETH");
  
  // Test 1: Create Order
  console.log("\nTest 1: Creating a limit order...");
  
  // Using properly checksummed token addresses for testing
  // const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC
  // const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // Sepolia WETH
  
  // // Mock
  // const USDC_ADDRESS = ethers.getAddress("0xa0b86a33e6417b0f2b54b4b5f3c0f03aa9afb84f");
  // const WETH_ADDRESS = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

  const orderParams = {
    tokenIn: USDC_ADDRESS,
    tokenOut: WETH_ADDRESS,
    amount: ethers.parseUnits("1000", 6), // 1000 USDC
    targetPrice: ethers.parseEther("0.0002625"), // 1 USDC = 0.0002625 ETH
    expiry: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
  };
  
  try {
    const tx = await transparentOrderBook.connect(maker).createOrder(
      orderParams.tokenIn,
      orderParams.tokenOut,
      orderParams.amount,
      orderParams.targetPrice,
      orderParams.expiry
    );
    
    const receipt = await tx.wait();
    console.log("Order created successfully!");
    console.log("  Transaction Hash:", receipt?.hash);
    console.log("  Gas Used:", receipt?.gasUsed.toString());
    
    // Get the order hash from the event
    const orderCreatedEvent = receipt?.logs.find(log => {
      try {
        return transparentOrderBook.interface.parseLog(log as any)?.name === 'OrderCreated';
      } catch {
        return false;
      }
    });
    
    if (orderCreatedEvent) {
      const parsedEvent = transparentOrderBook.interface.parseLog(orderCreatedEvent as any);
      const orderHash = parsedEvent?.args.orderHash;
      console.log("- Order Hash:", orderHash);
      
      // Test 2: Get Order Details
      console.log("\nTest 2: Retrieving order details...");
      const order = await transparentOrderBook.getOrder(orderHash);
      
      console.log("Order Details:");
      console.log("- Maker:", order.maker);
      console.log("- Token In:", order.tokenIn);
      console.log("- Token Out:", order.tokenOut);
      console.log("- Amount:", ethers.formatUnits(order.amount, 6), "USDC");
      console.log("- Target Price:", ethers.formatEther(order.targetPrice), "ETH per USDC");
      console.log("- Status:", getOrderStatusString(order.status)); // Fixed: Convert bigint to number
      console.log("- Timestamp:", new Date(Number(order.timestamp) * 1000).toISOString());
      console.log("- Expiry:", new Date(Number(order.expiry) * 1000).toISOString());
      
      // Test 3: Get Active Orders
      console.log("\nTest 3: Getting active orders...");
      const activeOrders = await transparentOrderBook.getActiveOrders();
      console.log("Active orders count:", activeOrders.length);
      
      // Test 4: Get Orders by Maker
      console.log("\nTest 4: Getting orders by maker...");
      const makerOrders = await transparentOrderBook.getOrdersByMaker(maker.address);
      console.log("Maker orders count:", makerOrders.length);
      
      // Test 5: Cancel Order
      console.log("\nTest 5: Testing order cancellation...");
      const cancelTx = await transparentOrderBook.connect(maker).cancelOrder(orderHash);
      await cancelTx.wait();
      console.log("Order cancelled successfully!");
      
      // Verify cancellation
      const cancelledOrder = await transparentOrderBook.getOrder(orderHash);
      console.log("- New Status:", getOrderStatusString(cancelledOrder.status)); // Fixed: Convert bigint to number
      
    }
    
  } catch (error: any) {
    console.error("Test failed:", error.message);
    return;
  }
  
  // Test 6: Contract State
  console.log("\nTest 6: Contract state verification...");
  const totalOrders = await transparentOrderBook.orderCount();
  const owner = await transparentOrderBook.owner();
  
  console.log("Contract State:");
  console.log("- Total Orders Created:", totalOrders.toString());
  console.log("- Contract Owner:", owner);
  console.log("- Contract Address:", await transparentOrderBook.getAddress());
  
  console.log("\nAll tests completed successfully!");
}

main()
  .then(() => {
    console.log("\nContract interaction tests completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nTests failed:");
    console.error(error);
    process.exit(1);
  });