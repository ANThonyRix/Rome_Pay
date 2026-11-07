// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local stand-in for Rome's wUSDC wrapper (6 decimals). Tests only.
contract MockWUSDC is ERC20 {
    constructor() ERC20("Wrapped USDC", "wUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
