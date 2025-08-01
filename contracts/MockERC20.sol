// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @dev Simple ERC20 token for testing purposes
 * @notice This token is only for testing - DO NOT use in production
 */
contract MockERC20 is ERC20 {
    uint8 private _decimals;
    
    /**
     * @dev Constructor to create a mock ERC20 token
     * @param name Name of the token
     * @param symbol Symbol of the token
     * @param decimals_ Number of decimals for the token
     */
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        
        // Mint initial supply to deployer for testing
        // USDC: 1,000,000 tokens
        // WETH: 1,000 tokens
        uint256 initialSupply = decimals_ == 6 ? 
            1_000_000 * 10**decimals_ :  // 1M USDC
            1_000 * 10**decimals_;       // 1K WETH
            
        _mint(msg.sender, initialSupply);
    }
    
    /**
     * @dev Returns the number of decimals used to get its user representation
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    /**
     * @dev Mint tokens to any address (for testing purposes)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    /**
     * @dev Burn tokens from any address (for testing purposes)
     * @param from Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
    
    /**
     * @dev Get balance in a human-readable format
     * @param account Address to check balance for
     * @return Human-readable balance string
     */
    function balanceString(address account) external view returns (string memory) {
        uint256 balance = balanceOf(account);
        uint256 wholePart = balance / 10**decimals();
        uint256 fractionalPart = balance % 10**decimals();
        
        return string(abi.encodePacked(
            _toString(wholePart),
            ".",
            _toString(fractionalPart),
            " ",
            symbol()
        ));
    }
    
    /**
     * @dev Convert uint256 to string
     * @param value Value to convert
     * @return String representation
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}