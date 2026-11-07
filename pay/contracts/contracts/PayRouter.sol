// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title PayRouter
/// @notice Non-custodial payment router for Rome Pay. A payer settles an
/// off-chain invoice (`ref`) by moving `token` (the chain's canonical wUSDC
/// wrapper) straight to the merchant, minus an optional protocol fee.
/// @dev Value moves as ERC-20, never `msg.value`: a Solana wallet's funds reach
/// the EVM side only as the SPL wrapper. The contract keeps no per-payment
/// storage (on Rome every new slot can cost a new Solana account); the backend
/// matches `Paid` events to invoices and dedupes by `ref`.
contract PayRouter is Ownable2Step {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_FEE_BPS = 100; // 1%
    uint16 private constant BPS = 10_000;

    IERC20 public immutable token;

    uint16 public feeBps;
    address public feeRecipient;

    event Paid(
        bytes32 indexed ref,
        address indexed merchant,
        address indexed payer,
        uint256 amount,
        uint256 fee
    );
    event FeeUpdated(uint16 feeBps, address indexed feeRecipient);

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh();
    error InvalidRecipient();

    constructor(IERC20 token_, address owner_) Ownable(owner_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    /// @notice Pay `amount` of `token` to `merchant` for invoice `ref`.
    /// @dev The payer must `approve` this contract for `amount` first. Tokens
    /// are only ever pulled from `msg.sender`, so an allowance cannot be spent
    /// by anyone else. The router has no rescue path, so it can never be a
    /// recipient.
    function pay(address merchant, uint256 amount, bytes32 ref) external {
        if (merchant == address(0)) revert ZeroAddress();
        if (merchant == address(this)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();

        uint256 fee = (amount * feeBps) / BPS;
        if (fee != 0) {
            token.safeTransferFrom(msg.sender, feeRecipient, fee);
        }
        token.safeTransferFrom(msg.sender, merchant, amount - fee);

        emit Paid(ref, merchant, msg.sender, amount, fee);
    }

    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ != 0 && feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeRecipient_ == address(this)) revert InvalidRecipient();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }
}
