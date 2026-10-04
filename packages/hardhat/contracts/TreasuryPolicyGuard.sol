// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { ISaucerSwapRouter } from "./interfaces/ISaucerSwapRouter.sol";

/// @title TreasuryPolicyGuard
/// @notice A small HBAR treasury that can only be spent through SaucerSwap V2, and only
///         inside rules the contract itself enforces (not the UI).
///
/// Roles
///  - DEFAULT_ADMIN_ROLE: sets limits, token rules and payout recipients, unpauses, withdraws.
///                        Meant to be a DAO multisig or governance account.
///  - EXECUTOR_ROLE:      may run swaps that satisfy the policy (treasurer / ops account).
///  - GUARDIAN_ROLE:      may only pause (fast incident response). Admin can pause too.
///
/// Policy enforced on every swap
///  - amountIn within [minAmountIn, maxAmountIn] and the rolling UTC-day total within dailyCap
///  - single-hop path WHBAR -> allowed token (fee tier is not restricted)
///  - recipient on the payout allowlist (so swapped tokens can only land on approved accounts)
///  - amountOutMinimum > 0 and, when set, at or above the token's minimum rate (price floor)
///  - deadline in the future and at most MAX_DEADLINE_WINDOW away
///
/// Units: inside the Hedera EVM, msg.value and address(this).balance are in TINYBARS (8 decimals),
/// the same unit SaucerSwap's `amountIn` uses. JSON-RPC relays convert from 18-decimal weibars.
contract TreasuryPolicyGuard is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    /// Longest allowed gap between now and a swap deadline.
    uint256 public constant MAX_DEADLINE_WINDOW = 1 hours;

    /// tokenIn (20 bytes) | fee (3 bytes) | tokenOut (20 bytes)
    uint256 private constant SINGLE_HOP_PATH_LENGTH = 43;
    uint256 private constant TOKEN_OUT_OFFSET = 23;
    uint256 private constant ADDRESS_BYTES = 20;
    uint256 private constant TINYBARS_PER_HBAR = 1e8;

    struct Limits {
        uint256 minAmountIn; // tinybars
        uint256 maxAmountIn; // tinybars, per swap
        uint256 dailyCap; // tinybars, per UTC day
    }

    struct TokenRule {
        bool allowed;
        /// Minimum output (token smallest units) per 1 HBAR of input. 0 disables the price floor.
        uint256 minOutPerHbar;
    }

    ISaucerSwapRouter public immutable router;
    address public immutable whbar;

    Limits public limits;
    mapping(address token => TokenRule rule) public tokenRules;
    mapping(address recipient => bool allowed) public allowedRecipients;
    mapping(uint256 utcDay => uint256 spent) public spentOnDay;

    event Funded(address indexed from, uint256 amount);
    event LimitsUpdated(uint256 minAmountIn, uint256 maxAmountIn, uint256 dailyCap);
    event TokenRuleUpdated(address indexed token, bool allowed, uint256 minOutPerHbar);
    event RecipientUpdated(address indexed recipient, bool allowed);
    event Withdrawn(address indexed to, uint256 amount);
    event SwapExecuted(
        address indexed executor,
        address indexed recipient,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 amountOut,
        uint256 utcDay
    );

    error ZeroAddress();
    error InvalidLimits();
    error NotGuardian();
    error InvalidPath();
    error AmountOutOfRange(uint256 amountIn, uint256 minAmountIn, uint256 maxAmountIn);
    error DailyCapExceeded(uint256 requestedTotal, uint256 dailyCap);
    error TokenNotAllowed(address token);
    error RecipientNotAllowed(address recipient);
    error PriceFloorViolated(uint256 amountOutMinimum, uint256 requiredMinimum);
    error DeadlineOutOfRange(uint256 deadline);
    error InsufficientTreasury(uint256 balance, uint256 required);
    error OutputBelowMinimum(uint256 amountOut, uint256 amountOutMinimum);
    error TransferFailed();

    constructor(address admin, address router_, address whbar_, Limits memory initialLimits) {
        if (admin == address(0) || router_ == address(0) || whbar_ == address(0)) revert ZeroAddress();
        router = ISaucerSwapRouter(router_);
        whbar = whbar_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _setLimits(initialLimits);
    }

    /// Anyone may top up the treasury with HBAR.
    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    // ---------------------------------------------------------------------
    // Swap
    // ---------------------------------------------------------------------

    /// Swap treasury HBAR for an allowed token through SaucerSwap V2 `multicall([exactInput, refundETH])`.
    /// @param path       Single hop: WHBAR (20 bytes) | fee (3 bytes) | tokenOut (20 bytes).
    /// @param recipient  Must be on the payout allowlist and already associated with `tokenOut` (HTS).
    /// @param amountIn   Tinybars to spend.
    /// @param amountOutMinimum Slippage floor passed to the router; must satisfy the token's price floor.
    /// @param deadline   Unix seconds, at most MAX_DEADLINE_WINDOW from now.
    function swapHbarForToken(
        bytes calldata path,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 deadline
    ) external onlyRole(EXECUTOR_ROLE) whenNotPaused nonReentrant returns (uint256 amountOut) {
        address tokenOut = _tokenOutOf(path);
        _enforcePolicy(tokenOut, recipient, amountIn, amountOutMinimum, deadline);
        uint256 utcDay = _recordSpend(amountIn);

        amountOut = _routeSwap(path, recipient, amountIn, amountOutMinimum, deadline);

        emit SwapExecuted(msg.sender, recipient, tokenOut, amountIn, amountOutMinimum, amountOut, utcDay);
    }

    /// Tinybars still spendable today under the daily cap.
    function remainingToday() external view returns (uint256) {
        uint256 spent = spentOnDay[block.timestamp / 1 days];
        return spent >= limits.dailyCap ? 0 : limits.dailyCap - spent;
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    function setLimits(Limits calldata newLimits) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setLimits(newLimits);
    }

    function setTokenRule(address token, bool allowed, uint256 minOutPerHbar) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert ZeroAddress();
        tokenRules[token] = TokenRule({ allowed: allowed, minOutPerHbar: minOutPerHbar });
        emit TokenRuleUpdated(token, allowed, minOutPerHbar);
    }

    function setRecipient(address recipient, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (recipient == address(0)) revert ZeroAddress();
        allowedRecipients[recipient] = allowed;
        emit RecipientUpdated(recipient, allowed);
    }

    /// Guardians and admins can halt swaps immediately.
    function pause() external {
        if (!hasRole(GUARDIAN_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotGuardian();
        _pause();
    }

    /// Only the admin can resume, so a compromised guardian cannot re-enable swaps.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// Admin escape hatch: move HBAR out of the treasury.
    function withdraw(address payable to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (address(this).balance < amount) revert InsufficientTreasury(address(this).balance, amount);
        (bool ok, ) = to.call{ value: amount }("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(to, amount);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// Checks the daily cap and treasury balance, then books the spend before any external call.
    function _recordSpend(uint256 amountIn) private returns (uint256 utcDay) {
        utcDay = block.timestamp / 1 days;
        uint256 totalToday = spentOnDay[utcDay] + amountIn;
        if (totalToday > limits.dailyCap) revert DailyCapExceeded(totalToday, limits.dailyCap);
        if (address(this).balance < amountIn) revert InsufficientTreasury(address(this).balance, amountIn);
        spentOnDay[utcDay] = totalToday;
    }

    /// Calls SaucerSwap `multicall([exactInput, refundETH])`, forwarding exactly `amountIn` tinybars.
    function _routeSwap(
        bytes calldata path,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 deadline
    ) private returns (uint256 amountOut) {
        ISaucerSwapRouter.ExactInputParams memory params = ISaucerSwapRouter.ExactInputParams({
            path: path,
            recipient: recipient,
            deadline: deadline,
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum
        });

        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(ISaucerSwapRouter.exactInput, (params));
        calls[1] = abi.encodeCall(ISaucerSwapRouter.refundETH, ());

        bytes[] memory results = router.multicall{ value: amountIn }(calls);
        amountOut = abi.decode(results[0], (uint256));
        if (amountOut < amountOutMinimum) revert OutputBelowMinimum(amountOut, amountOutMinimum);
    }

    function _setLimits(Limits memory newLimits) private {
        if (
            newLimits.maxAmountIn == 0 ||
            newLimits.minAmountIn > newLimits.maxAmountIn ||
            newLimits.maxAmountIn > newLimits.dailyCap
        ) revert InvalidLimits();
        limits = newLimits;
        emit LimitsUpdated(newLimits.minAmountIn, newLimits.maxAmountIn, newLimits.dailyCap);
    }

    /// Requires a single hop that starts at WHBAR and returns the output token.
    function _tokenOutOf(bytes calldata path) private view returns (address tokenOut) {
        if (path.length != SINGLE_HOP_PATH_LENGTH) revert InvalidPath();
        address tokenIn = address(bytes20(path[0:ADDRESS_BYTES]));
        if (tokenIn != whbar) revert InvalidPath();
        tokenOut = address(bytes20(path[TOKEN_OUT_OFFSET:SINGLE_HOP_PATH_LENGTH]));
    }

    function _enforcePolicy(
        address tokenOut,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint256 deadline
    ) private view {
        Limits memory l = limits;
        if (amountIn < l.minAmountIn || amountIn > l.maxAmountIn) {
            revert AmountOutOfRange(amountIn, l.minAmountIn, l.maxAmountIn);
        }

        TokenRule memory rule = tokenRules[tokenOut];
        if (!rule.allowed) revert TokenNotAllowed(tokenOut);
        if (!allowedRecipients[recipient]) revert RecipientNotAllowed(recipient);

        // Price floor: amountOutMinimum / amountIn (per HBAR) must not be below the configured rate.
        uint256 requiredMinimum = (amountIn * rule.minOutPerHbar) / TINYBARS_PER_HBAR;
        if (amountOutMinimum == 0 || amountOutMinimum < requiredMinimum) {
            revert PriceFloorViolated(amountOutMinimum, requiredMinimum);
        }

        if (deadline < block.timestamp || deadline > block.timestamp + MAX_DEADLINE_WINDOW) {
            revert DeadlineOutOfRange(deadline);
        }
    }
}
