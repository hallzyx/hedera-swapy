// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { ISaucerSwapRouter } from "../interfaces/ISaucerSwapRouter.sol";

/// Test-only stand-in for the SaucerSwap V2 router. It records what the guard sends and returns
/// a configurable output amount, so policy behaviour can be tested without a live pool.
contract MockSaucerSwapRouter {
    /// Output (token smallest units) the mock pays per 1 HBAR (1e8 tinybars) of input.
    uint256 public outPerHbar;
    uint256 public lastAmountIn;
    uint256 public lastValue;
    address public lastRecipient;
    bytes public lastPath;
    uint256 public refundCalls;

    function setOutPerHbar(uint256 rate) external {
        outPerHbar = rate;
    }

    function exactInput(ISaucerSwapRouter.ExactInputParams calldata params) external payable returns (uint256) {
        require(msg.value >= params.amountIn, "MockRouter: value below amountIn");
        uint256 amountOut = (params.amountIn * outPerHbar) / 1e8;
        require(amountOut >= params.amountOutMinimum, "Too little received");
        lastAmountIn = params.amountIn;
        lastValue = msg.value;
        lastRecipient = params.recipient;
        lastPath = params.path;
        return amountOut;
    }

    function refundETH() external payable {
        refundCalls += 1;
    }

    /// Same delegatecall pattern as the real multicall: msg.value is preserved for each call.
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results) {
        results = new bytes[](data.length);
        for (uint256 i = 0; i < data.length; i++) {
            (bool ok, bytes memory res) = address(this).delegatecall(data[i]);
            require(ok, "MockRouter: call failed");
            results[i] = res;
        }
    }

    receive() external payable {}
}
