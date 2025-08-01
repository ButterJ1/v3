// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TransparentOrderBook
 * @dev Core transparent order system for cross-chain limit orders
 * @notice This contract manages transparent limit orders with real-time visibility
 */
contract TransparentOrderBook is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // =============================================================
    //                          ENUMS
    // =============================================================
    
    enum OrderStatus {
        PENDING,    // Price not in range, only approved
        ONGOING,    // Price in range, order active
        EXPIRED,    // Order expired
        SUCCESS,    // Order completed
        CANCELLED   // Order cancelled
    }

    // =============================================================
    //                          STRUCTS
    // =============================================================
    
    /**
     * @dev Core public order structure - visible to all users
     * @param maker Address of order creator
     * @param tokenIn Token being sold
     * @param tokenOut Token being bought
     * @param amount Amount of tokenIn to sell
     * @param targetPrice Target price (in tokenOut per tokenIn, scaled by 1e18)
     * @param timestamp Order creation timestamp
     * @param expiry Order expiration timestamp
     * @param status Current order status
     */
    struct PublicOrder {
        address maker;
        address tokenIn;
        address tokenOut;
        uint256 amount;
        uint256 targetPrice;
        uint256 timestamp;
        uint256 expiry;
        OrderStatus status;
    }

    // =============================================================
    //                          STORAGE
    // =============================================================
    
    /// @dev Mapping from order hash to order details
    mapping(bytes32 => PublicOrder) public orders;
    
    /// @dev Array of all order hashes for enumeration
    bytes32[] public orderHashes;
    
    /// @dev Total number of orders created
    uint256 public orderCount;
    
    /// @dev Mapping to track if order hash exists
    mapping(bytes32 => bool) public orderExists;

    // =============================================================
    //                          EVENTS
    // =============================================================
    
    event OrderCreated(
        bytes32 indexed orderHash,
        address indexed maker,
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 targetPrice,
        uint256 expiry,
        OrderStatus status
    );
    
    event OrderStatusChanged(
        bytes32 indexed orderHash,
        OrderStatus oldStatus,
        OrderStatus newStatus
    );
    
    event OrderCancelled(
        bytes32 indexed orderHash,
        address indexed maker
    );

    // =============================================================
    //                        CONSTRUCTOR
    // =============================================================
    
    constructor() Ownable(msg.sender) {}

    // =============================================================
    //                      CORE FUNCTIONS
    // =============================================================
    
    /**
     * @dev Create a new transparent limit order
     * @param tokenIn Token to sell
     * @param tokenOut Token to buy
     * @param amount Amount of tokenIn to sell
     * @param targetPrice Target price (scaled by 1e18)
     * @param expiry Order expiration timestamp
     * @return orderHash Unique identifier for the order
     */
    function createOrder(
        address tokenIn,
        address tokenOut,
        uint256 amount,
        uint256 targetPrice,
        uint256 expiry
    ) external nonReentrant returns (bytes32 orderHash) {
        require(tokenIn != address(0), "Invalid tokenIn");
        require(tokenOut != address(0), "Invalid tokenOut");
        require(tokenIn != tokenOut, "Same token");
        require(amount > 0, "Amount must be > 0");
        require(targetPrice > 0, "Target price must be > 0");
        require(expiry > block.timestamp, "Invalid expiry");
        
        // Generate unique order hash
        orderHash = keccak256(
            abi.encodePacked(
                msg.sender,
                tokenIn,
                tokenOut,
                amount,
                targetPrice,
                block.timestamp,
                orderCount
            )
        );
        
        require(!orderExists[orderHash], "Order exists");
        
        // Create order with PENDING status (price protection will be checked later)
        orders[orderHash] = PublicOrder({
            maker: msg.sender,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amount: amount,
            targetPrice: targetPrice,
            timestamp: block.timestamp,
            expiry: expiry,
            status: OrderStatus.PENDING
        });
        
        // Store order hash for enumeration
        orderHashes.push(orderHash);
        orderExists[orderHash] = true;
        orderCount++;
        
        emit OrderCreated(
            orderHash,
            msg.sender,
            tokenIn,
            tokenOut,
            amount,
            targetPrice,
            expiry,
            OrderStatus.PENDING
        );
    }
    
    /**
     * @dev Cancel an existing order
     * @param orderHash Hash of order to cancel
     */
    function cancelOrder(bytes32 orderHash) external nonReentrant {
        require(orderExists[orderHash], "Order doesn't exist");
        
        PublicOrder storage order = orders[orderHash];
        
        require(order.maker == msg.sender, "Not order maker");
        require(
            order.status == OrderStatus.PENDING || 
            order.status == OrderStatus.ONGOING,
            "Cannot cancel order"
        );
        
        OrderStatus oldStatus = order.status;
        order.status = OrderStatus.CANCELLED;
        
        emit OrderStatusChanged(orderHash, oldStatus, OrderStatus.CANCELLED);
        emit OrderCancelled(orderHash, msg.sender);
    }
    
    /**
     * @dev Update order status (internal function for price protection module)
     * @param orderHash Hash of order to update
     * @param newStatus New status to set
     */
    function updateOrderStatus(
        bytes32 orderHash, 
        OrderStatus newStatus
    ) external onlyOwner {
        require(orderExists[orderHash], "Order doesn't exist");
        
        PublicOrder storage order = orders[orderHash];
        OrderStatus oldStatus = order.status;
        
        // Validate status transitions
        require(_isValidStatusTransition(oldStatus, newStatus), "Invalid status transition");
        
        order.status = newStatus;
        
        emit OrderStatusChanged(orderHash, oldStatus, newStatus);
    }

    // =============================================================
    //                       VIEW FUNCTIONS
    // =============================================================
    
    /**
     * @dev Get order details by hash
     * @param orderHash Hash of the order
     * @return Order details
     */
    function getOrder(bytes32 orderHash) external view returns (PublicOrder memory) {
        require(orderExists[orderHash], "Order doesn't exist");
        return orders[orderHash];
    }
    
    /**
     * @dev Get all orders with optional status filter
     * @param statusFilter Filter by order status (255 = no filter)
     * @return filteredOrders Array of orders matching filter
     */
    function getAllOrders(uint8 statusFilter) external view returns (PublicOrder[] memory) {
        uint256 matchingCount = 0;
        
        // First pass: count matching orders
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (statusFilter == 255 || uint8(orders[orderHashes[i]].status) == statusFilter) {
                matchingCount++;
            }
        }
        
        // Second pass: populate results
        PublicOrder[] memory filteredOrders = new PublicOrder[](matchingCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (statusFilter == 255 || uint8(orders[orderHashes[i]].status) == statusFilter) {
                filteredOrders[currentIndex] = orders[orderHashes[i]];
                currentIndex++;
            }
        }
        
        return filteredOrders;
    }
    
    /**
     * @dev Get orders by maker address
     * @param maker Address of the order maker
     * @return makerOrders Array of orders by the maker
     */
    function getOrdersByMaker(address maker) external view returns (PublicOrder[] memory) {
        uint256 matchingCount = 0;
        
        // Count matching orders
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (orders[orderHashes[i]].maker == maker) {
                matchingCount++;
            }
        }
        
        // Populate results
        PublicOrder[] memory makerOrders = new PublicOrder[](matchingCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            if (orders[orderHashes[i]].maker == maker) {
                makerOrders[currentIndex] = orders[orderHashes[i]];
                currentIndex++;
            }
        }
        
        return makerOrders;
    }
    
    /**
     * @dev Get active orders (PENDING or ONGOING status)
     * @return activeOrders Array of active orders
     */
    function getActiveOrders() external view returns (PublicOrder[] memory) {
        uint256 activeCount = 0;
        
        // Count active orders
        for (uint256 i = 0; i < orderHashes.length; i++) {
            OrderStatus status = orders[orderHashes[i]].status;
            if (status == OrderStatus.PENDING || status == OrderStatus.ONGOING) {
                activeCount++;
            }
        }
        
        // Populate results
        PublicOrder[] memory activeOrders = new PublicOrder[](activeCount);
        uint256 currentIndex = 0;
        
        for (uint256 i = 0; i < orderHashes.length; i++) {
            OrderStatus status = orders[orderHashes[i]].status;
            if (status == OrderStatus.PENDING || status == OrderStatus.ONGOING) {
                activeOrders[currentIndex] = orders[orderHashes[i]];
                currentIndex++;
            }
        }
        
        return activeOrders;
    }
    
    /**
     * @dev Check if order has expired
     * @param orderHash Hash of the order
     * @return expired True if order has expired
     */
    function isOrderExpired(bytes32 orderHash) external view returns (bool) {
        require(orderExists[orderHash], "Order doesn't exist");
        return block.timestamp > orders[orderHash].expiry;
    }

    // =============================================================
    //                     INTERNAL FUNCTIONS
    // =============================================================
    
    /**
     * @dev Validate status transitions
     * @param from Current status
     * @param to New status
     * @return valid True if transition is valid
     */
    function _isValidStatusTransition(
        OrderStatus from,
        OrderStatus to
    ) internal pure returns (bool) {
        if (from == OrderStatus.PENDING) {
            return to == OrderStatus.ONGOING || 
                   to == OrderStatus.CANCELLED || 
                   to == OrderStatus.EXPIRED;
        }
        
        if (from == OrderStatus.ONGOING) {
            return to == OrderStatus.SUCCESS || 
                   to == OrderStatus.CANCELLED || 
                   to == OrderStatus.EXPIRED;
        }
        
        // Terminal states cannot transition
        return false;
    }
}