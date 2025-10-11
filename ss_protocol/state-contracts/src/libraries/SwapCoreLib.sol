// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

library SwapCoreLib {
    using SafeERC20 for IERC20;
    
    struct SwapData {
        address user;
        address inputToken;
        address stateToken;
        uint256 userStateFromBurn;
        uint256 amountOut;
        uint256 feeIn;
        uint256 burnIn;
        uint256 currentDayStart;
        uint256 todayIdx;
    }

    struct SwapParams {
        address user;
        address inputToken;
        address stateToken;
        uint256 currentCycle;
        uint256 dailyStateReleased;
        uint256 dailyStateReleasedNormal;
        uint256 dailySwapsCount;
        uint256 dailyUniqueSwappersCount;
        uint256 currentDayStart;
        uint256 userStateFromBurn;
        uint256 amountOut;
    }

    struct UserSwapInfo {
        bool hasSwapped;
        bool hasReverseSwap;
        uint256 cycle;
    }

    function getSwapInfoKey(
        address user,
        address inputToken,
        address stateToken,
        uint256 cycle
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, inputToken, stateToken, cycle));
    }
}