// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal slice of the SaucerSwap V2 SwapRouter used by the treasury guard.
/// Testnet router: 0.0.1414040 (0x0000000000000000000000000000000000159398).
interface ISaucerSwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);

    function refundETH() external payable;

    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
}
