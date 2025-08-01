import { expect } from "chai";
import { ethers } from "hardhat";
import { TransparentOrderBook, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TransparentOrderBook", function () {
  let transparentOrderBook: TransparentOrderBook;
  let mockUSDC: MockERC20;
  let mockWETH: MockERC20;
  let owner: SignerWithAddress;
  let maker: SignerWithAddress;
  let taker: SignerWithAddress;

  beforeEach(async function () {
    // Get signers
    [owner, maker, taker] = await ethers.getSigners();

    // Deploy mock tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    
    mockUSDC = await MockERC20Factory.deploy("Mock USDC", "USDC", 6);
    await mockUSDC.waitForDeployment();
    
    mockWETH = await MockERC20Factory.deploy("Mock WETH", "WETH", 18);
    await mockWETH.waitForDeployment();

    // Deploy TransparentOrderBook
    const TransparentOrderBookFactory = await ethers.getContractFactory("TransparentOrderBook");
    transparentOrderBook = await TransparentOrderBookFactory.deploy();
    await transparentOrderBook.waitForDeployment();

    // Mint tokens to maker
    await mockUSDC.mint(maker.address, ethers.parseUnits("10000", 6)); // 10,000 USDC
    await mockWETH.mint(maker.address, ethers.parseEther("100")); // 100 WETH
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await transparentOrderBook.owner()).to.equal(owner.address);
    });

    it("Should have zero initial orders", async function () {
      expect(await transparentOrderBook.orderCount()).to.equal(0);
    });
  });

  describe("Order Creation", function () {
    it("Should create an order successfully", async function () {
      const orderParams = {
        tokenIn: await mockUSDC.getAddress(),
        tokenOut: await mockWETH.getAddress(),
        amount: ethers.parseUnits("1000", 6), // 1000 USDC
        targetPrice: ethers.parseEther("0.0003"), // 1 USDC = 0.0003 ETH
        expiry: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const tx = await transparentOrderBook.connect(maker).createOrder(
        orderParams.tokenIn,
        orderParams.tokenOut,
        orderParams.amount,
        orderParams.targetPrice,
        orderParams.expiry
      );

      await expect(tx).to.emit(transparentOrderBook, "OrderCreated");
      
      expect(await transparentOrderBook.orderCount()).to.equal(1);
    });

    it("Should reject invalid parameters", async function () {
      const expiry = Math.floor(Date.now() / 1000) + 3600;
      const tokenIn = await mockUSDC.getAddress();
      const tokenOut = await mockWETH.getAddress();

      // Zero amount
      await expect(
        transparentOrderBook.connect(maker).createOrder(
          tokenIn,
          tokenOut,
          0,
          ethers.parseEther("0.0003"),
          expiry
        )
      ).to.be.revertedWith("Amount must be > 0");

      // Zero target price
      await expect(
        transparentOrderBook.connect(maker).createOrder(
          tokenIn,
          tokenOut,
          ethers.parseUnits("1000", 6),
          0,
          expiry
        )
      ).to.be.revertedWith("Target price must be > 0");

      // Same token addresses
      await expect(
        transparentOrderBook.connect(maker).createOrder(
          tokenIn,
          tokenIn,
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.0003"),
          expiry
        )
      ).to.be.revertedWith("Same token");

      // Past expiry
      await expect(
        transparentOrderBook.connect(maker).createOrder(
          tokenIn,
          tokenOut,
          ethers.parseUnits("1000", 6),
          ethers.parseEther("0.0003"),
          Math.floor(Date.now() / 1000) - 1000 // Past timestamp
        )
      ).to.be.revertedWith("Invalid expiry");
    });
  });

  describe("Order Management", function () {
    let orderHash: string;

    beforeEach(async function () {
      const orderParams = {
        tokenIn: await mockUSDC.getAddress(),
        tokenOut: await mockWETH.getAddress(),
        amount: ethers.parseUnits("1000", 6),
        targetPrice: ethers.parseEther("0.0003"),
        expiry: Math.floor(Date.now() / 1000) + 3600,
      };

      const tx = await transparentOrderBook.connect(maker).createOrder(
        orderParams.tokenIn,
        orderParams.tokenOut,
        orderParams.amount,
        orderParams.targetPrice,
        orderParams.expiry
      );

      const receipt = await tx.wait();
      const orderCreatedEvent = receipt?.logs.find(log => {
        try {
          return transparentOrderBook.interface.parseLog(log as any)?.name === 'OrderCreated';
        } catch {
          return false;
        }
      });

      if (orderCreatedEvent) {
        const parsedEvent = transparentOrderBook.interface.parseLog(orderCreatedEvent as any);
        orderHash = parsedEvent?.args.orderHash;
      }
    });

    it("Should retrieve order details correctly", async function () {
      const order = await transparentOrderBook.getOrder(orderHash);
      
      expect(order.maker).to.equal(maker.address);
      expect(order.amount).to.equal(ethers.parseUnits("1000", 6));
      expect(order.targetPrice).to.equal(ethers.parseEther("0.0003"));
      expect(order.status).to.equal(0); // PENDING
    });

    it("Should cancel order successfully", async function () {
      const tx = await transparentOrderBook.connect(maker).cancelOrder(orderHash);
      
      await expect(tx).to.emit(transparentOrderBook, "OrderCancelled");
      
      const order = await transparentOrderBook.getOrder(orderHash);
      expect(order.status).to.equal(4); // CANCELLED
    });

    it("Should not allow non-maker to cancel order", async function () {
      await expect(
        transparentOrderBook.connect(taker).cancelOrder(orderHash)
      ).to.be.revertedWith("Not order maker");
    });
  });

  describe("Query Functions", function () {
    beforeEach(async function () {
      const orderParams = {
        tokenIn: await mockUSDC.getAddress(),
        tokenOut: await mockWETH.getAddress(),
        amount: ethers.parseUnits("1000", 6),
        targetPrice: ethers.parseEther("0.0003"),
        expiry: Math.floor(Date.now() / 1000) + 3600,
      };

      // Create multiple orders
      await transparentOrderBook.connect(maker).createOrder(
        orderParams.tokenIn,
        orderParams.tokenOut,
        orderParams.amount,
        orderParams.targetPrice,
        orderParams.expiry
      );

      await transparentOrderBook.connect(taker).createOrder(
        orderParams.tokenIn,
        orderParams.tokenOut,
        orderParams.amount * 2n,
        orderParams.targetPrice,
        orderParams.expiry
      );
    });

    it("Should return active orders", async function () {
      const activeOrders = await transparentOrderBook.getActiveOrders();
      expect(activeOrders.length).to.equal(2);
    });

    it("Should return orders by maker", async function () {
      const makerOrders = await transparentOrderBook.getOrdersByMaker(maker.address);
      expect(makerOrders.length).to.equal(1);
      expect(makerOrders[0].maker).to.equal(maker.address);

      const takerOrders = await transparentOrderBook.getOrdersByMaker(taker.address);
      expect(takerOrders.length).to.equal(1);
      expect(takerOrders[0].maker).to.equal(taker.address);
    });

    it("Should filter orders by status", async function () {
      // Get all PENDING orders (status = 0)
      const pendingOrders = await transparentOrderBook.getAllOrders(0);
      expect(pendingOrders.length).to.equal(2);

      // Get all orders (status = 255 means no filter)
      const allOrders = await transparentOrderBook.getAllOrders(255);
      expect(allOrders.length).to.equal(2);
    });
  });

  describe("Gas Optimization", function () {
    it("Should use reasonable gas for order creation", async function () {
      const orderParams = {
        tokenIn: await mockUSDC.getAddress(),
        tokenOut: await mockWETH.getAddress(),
        amount: ethers.parseUnits("1000", 6),
        targetPrice: ethers.parseEther("0.0003"),
        expiry: Math.floor(Date.now() / 1000) + 3600,
      };

      const gasEstimate = await transparentOrderBook.connect(maker).createOrder.estimateGas(
        orderParams.tokenIn,
        orderParams.tokenOut,
        orderParams.amount,
        orderParams.targetPrice,
        orderParams.expiry
      );

      // Should use less than 300k gas for order creation
      expect(gasEstimate).to.be.lt(300000);
    });
  });
});