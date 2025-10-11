// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DAVTokenSafetyPatch
 * @notice Comprehensive safety library for DAV token pool verification
 * @dev Adds comprehensive pool validation including liquidity, reserves, and functionality checks
 */

// Enhanced interface for Buy & Burn Controller
interface IBuyAndBurnController {
    function stateWplsPool() external view returns (address);
    function getPoolReserves() external view returns (uint256 stateReserve, uint256 wplsReserve);
}

// Interface for PulseX Factory to verify pool
interface IPulseXFactoryCheck {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

// Interface for PulseX Pair to check reserves and functionality
interface IPulseXPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function totalSupply() external view returns (uint256);
}

library DAVSafety {
    
    // Events for monitoring and diagnostics
    event PoolValidationResult(address indexed pool, bool isValid, string reason);
    event PoolDiagnostics(address indexed pool, uint256 stateReserve, uint256 wplsReserve, uint256 totalSupply);
    
    // Pool validation status enumeration
    enum PoolStatus {
        NON_EXISTENT,
        EXISTS_NO_LIQUIDITY, 
        EXISTS_LOW_LIQUIDITY,
        EXISTS_IMBALANCED,
        EXISTS_FUNCTIONAL,
        EXISTS_OPTIMAL
    }
    
    // Pool requirements configuration
    struct PoolRequirements {
        uint256 minStateReserve;   // Minimum STATE tokens in pool
        uint256 minWplsReserve;    // Minimum WPLS in pool  
        uint256 minTotalLiquidity; // Minimum LP tokens
        uint256 maxImbalanceRatio; // Maximum allowed imbalance (in 1e18 precision)
        uint256 minPoolAge;        // Minimum pool age in seconds
    }
    
    /**
     * @notice Get standard pool requirements for validation
     * @return requirements Struct containing minimum thresholds
     */
    function getPoolRequirements() internal pure returns (PoolRequirements memory requirements) {
        return PoolRequirements({
            minStateReserve: 1000e18,     // 1000 STATE tokens minimum
            minWplsReserve: 1e18,         // 1 WPLS minimum
            minTotalLiquidity: 1000e18,   // 1000 LP tokens minimum
            maxImbalanceRatio: 100e18,    // 100:1 maximum ratio
            minPoolAge: 1 hours           // Pool must be at least 1 hour old
        });
    }
    
    /**
     * @notice Comprehensive pool functionality verification with detailed diagnostics
     * @param controller Buy & Burn Controller address
     * @param factory PulseX Factory address  
     * @param stateToken STATE token address
     * @param wplsToken WPLS token address
     * @return isValid True if pool exists and meets all functional requirements
     * @return reason Detailed reason for validation result
     */
    function verifyPoolFunctional(
        address controller,
        address factory,
        address stateToken,
        address wplsToken
    ) internal view returns (bool isValid, string memory reason) {
        // Step 1: Basic parameter validation
        if (controller == address(0)) return (false, "Controller zero address");
        if (factory == address(0)) return (false, "Factory zero address");
        if (stateToken == address(0)) return (false, "STATE token zero address");
        if (wplsToken == address(0)) return (false, "WPLS token zero address");
        
        // Step 2: Verify tokens are legitimate contracts
        if (!_isValidContract(stateToken)) return (false, "STATE token not a contract");
        if (!_isValidContract(wplsToken)) return (false, "WPLS token not a contract");
        
        // Step 3: Verify tokens are valid ERC20
        if (!_isValidERC20(stateToken)) return (false, "STATE token not valid ERC20");
        if (!_isValidERC20(wplsToken)) return (false, "WPLS token not valid ERC20");
        
        // Step 4: Get pool from controller with error handling
        address controllerPool;
        try IBuyAndBurnController(controller).stateWplsPool() returns (address pool) {
            controllerPool = pool;
        } catch (bytes memory errorData) {
            return (false, string(abi.encodePacked("Controller call failed: ", _bytesToString(errorData))));
        }
        
        if (controllerPool == address(0)) return (false, "Controller pool not set");
        
        // Step 5: Verify pool in factory
        address factoryPool = IPulseXFactoryCheck(factory).getPair(stateToken, wplsToken);
        if (factoryPool != controllerPool) return (false, "Pool address mismatch between controller and factory");
        
        // Step 6: Comprehensive pool validation
        return _validatePoolDetails(controllerPool, stateToken, wplsToken);
    }
    
    /**
     * @notice Legacy function maintained for backward compatibility but enhanced
     * @dev This function now calls the comprehensive verification with basic result
     */
    function verifyPoolExists(
        address controller,
        address factory,
        address stateToken,
        address wplsToken
    ) internal view returns (bool poolExists) {
        (bool isValid,) = verifyPoolFunctional(controller, factory, stateToken, wplsToken);
        return isValid;
    }
    
    /**
     * @notice Get detailed pool status with progressive validation levels
     * @param controller Buy & Burn Controller address
     * @param factory PulseX Factory address  
     * @param stateToken STATE token address
     * @param wplsToken WPLS token address
     * @return status Detailed status level of the pool
     * @return message Human readable status message
     */
    function getPoolStatus(
        address controller,
        address factory,
        address stateToken,
        address wplsToken
    ) internal view returns (PoolStatus status, string memory message) {
        // Step 1: Basic existence check
        (bool exists, string memory existMsg) = _verifyPoolExists(controller, factory, stateToken, wplsToken);
        if (!exists) return (PoolStatus.NON_EXISTENT, existMsg);
        
        address pool = IPulseXFactoryCheck(factory).getPair(stateToken, wplsToken);
        
        // Step 2: Reserve check
        (bool hasReserves, string memory reserveMsg) = _verifyPoolReserves(pool);
        if (!hasReserves) return (PoolStatus.EXISTS_NO_LIQUIDITY, reserveMsg);
        
        // Step 3: Liquidity check
        (bool hasLiquidity, string memory liquidityMsg) = _verifyPoolLiquidity(pool);
        if (!hasLiquidity) return (PoolStatus.EXISTS_LOW_LIQUIDITY, liquidityMsg);
        
        // Step 4: Balance check
        (bool isBalanced, string memory balanceMsg) = _verifyPoolBalance(pool, stateToken, wplsToken);
        if (!isBalanced) return (PoolStatus.EXISTS_IMBALANCED, balanceMsg);
        
        // Step 5: Stability check
        (bool isStable, string memory stableMsg) = _verifyPoolStability(pool);
        if (!isStable) return (PoolStatus.EXISTS_FUNCTIONAL, stableMsg);
        
        return (PoolStatus.EXISTS_OPTIMAL, "Pool is optimal for operations");
    }
    
    /**
     * @notice Get comprehensive pool diagnostics for monitoring and debugging
     * @param controller Buy & Burn Controller address
     * @param factory PulseX Factory address  
     * @param stateToken STATE token address
     * @param wplsToken WPLS token address
     * @return controllerPool Pool address from controller
     * @return factoryPool Pool address from factory
     * @return stateReserve Amount of STATE tokens in pool
     * @return wplsReserve Amount of WPLS tokens in pool
     * @return totalLiquidity Total LP token supply
     * @return poolAge Age of pool in seconds
     * @return tokensMatch Whether controller and factory pool addresses match
     */
    function getPoolDiagnostics(
        address controller,
        address factory,
        address stateToken,
        address wplsToken
    ) internal view returns (
        address controllerPool,
        address factoryPool,
        uint256 stateReserve,
        uint256 wplsReserve,
        uint256 totalLiquidity,
        uint256 poolAge,
        bool tokensMatch
    ) {
        controllerPool = address(0);
        factoryPool = address(0);
        
        // Get pool from controller
        try IBuyAndBurnController(controller).stateWplsPool() returns (address cp) {
            controllerPool = cp;
        } catch {}
        
        // Get pool from factory
        factoryPool = IPulseXFactoryCheck(factory).getPair(stateToken, wplsToken);
        
        if (factoryPool != address(0)) {
            // Get reserves and determine which is which token
            try IPulseXPair(factoryPool).getReserves() returns (
                uint112 r0, uint112 r1, uint32 ts
            ) {
                address t0 = IPulseXPair(factoryPool).token0();
                if (t0 == stateToken) {
                    stateReserve = uint256(r0);
                    wplsReserve = uint256(r1);
                } else {
                    stateReserve = uint256(r1);
                    wplsReserve = uint256(r0);
                }
                poolAge = block.timestamp - uint256(ts);
            } catch {}
            
            // Get total liquidity
            try IPulseXPair(factoryPool).totalSupply() returns (uint256 supply) {
                totalLiquidity = supply;
            } catch {}
        }
        
        tokensMatch = (controllerPool == factoryPool && factoryPool != address(0));
    }
    
    // ================= INTERNAL VALIDATION FUNCTIONS =================
    
    /**
     * @notice Validate that an address is a contract
     */
    function _isValidContract(address addr) private view returns (bool) {
        return addr.code.length > 0;
    }
    
    /**
     * @notice Validate that a contract implements basic ERC20 functionality
     */
    function _isValidERC20(address token) private view returns (bool) {
        if (token.code.length == 0) return false;
        
        try IERC20(token).totalSupply() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    }
    
    /**
     * @notice Convert bytes to string for error reporting
     */
    function _bytesToString(bytes memory data) private pure returns (string memory) {
        if (data.length == 0) return "Unknown error";
        if (data.length < 68) return "Error too short";
        
        // Extract revert reason if it's a standard revert
        assembly {
            data := add(data, 0x04)
        }
        return abi.decode(data, (string));
    }
    
    /**
     * @notice Basic pool existence validation
     */
    function _verifyPoolExists(
        address controller,
        address factory,
        address stateToken,
        address wplsToken
    ) private view returns (bool exists, string memory reason) {
        if (controller == address(0)) return (false, "Controller address is zero");
        if (factory == address(0)) return (false, "Factory address is zero");
        
        try IBuyAndBurnController(controller).stateWplsPool() returns (address controllerPool) {
            if (controllerPool == address(0)) return (false, "Controller pool not set");
            
            address factoryPool = IPulseXFactoryCheck(factory).getPair(stateToken, wplsToken);
            if (factoryPool == address(0)) return (false, "Pool does not exist in factory");
            if (controllerPool != factoryPool) return (false, "Pool address mismatch");
            
            return (true, "Pool exists");
        } catch {
            return (false, "Controller call failed");
        }
    }
    
    /**
     * @notice Validate pool has sufficient reserves
     */
    function _verifyPoolReserves(address pool) private view returns (bool, string memory) {
        PoolRequirements memory req = getPoolRequirements();
        
        try IPulseXPair(pool).getReserves() returns (
            uint112 reserve0, 
            uint112 reserve1, 
            uint32
        ) {
            if (uint256(reserve0) < req.minStateReserve && uint256(reserve1) < req.minWplsReserve) {
                return (false, "Insufficient reserves in pool");
            }
            
            if (uint256(reserve0) == 0 || uint256(reserve1) == 0) {
                return (false, "One or both reserves are zero");
            }
            
            return (true, "Reserves are sufficient");
        } catch {
            return (false, "Cannot read pool reserves");
        }
    }
    
    /**
     * @notice Validate pool has sufficient total liquidity
     */
    function _verifyPoolLiquidity(address pool) private view returns (bool, string memory) {
        PoolRequirements memory req = getPoolRequirements();
        
        try IPulseXPair(pool).totalSupply() returns (uint256 totalSupply) {
            if (totalSupply < req.minTotalLiquidity) {
                return (false, "Insufficient total liquidity");
            }
            
            return (true, "Liquidity is sufficient");
        } catch {
            return (false, "Cannot read pool liquidity");
        }
    }
    
    /**
     * @notice Validate pool balance is not too imbalanced
     */
    function _verifyPoolBalance(address pool, address stateToken, address wplsToken) 
        private view returns (bool, string memory) 
    {
        PoolRequirements memory req = getPoolRequirements();
        
        try IPulseXPair(pool).getReserves() returns (
            uint112 reserve0, 
            uint112 reserve1, 
            uint32
        ) {
            // Determine which reserve corresponds to which token
            address token0 = IPulseXPair(pool).token0();
            uint256 stateReserve;
            uint256 wplsReserve;
            
            if (token0 == stateToken) {
                stateReserve = uint256(reserve0);
                wplsReserve = uint256(reserve1);
            } else if (token0 == wplsToken) {
                stateReserve = uint256(reserve1);
                wplsReserve = uint256(reserve0);
            } else {
                return (false, "Pool tokens do not match STATE/WPLS");
            }
            
            // Check individual minimums
            if (stateReserve < req.minStateReserve) {
                return (false, "STATE reserve below minimum");
            }
            
            if (wplsReserve < req.minWplsReserve) {
                return (false, "WPLS reserve below minimum");
            }
            
            // Check balance ratio
            uint256 ratio = stateReserve > wplsReserve ? 
                (stateReserve * 1e18) / wplsReserve : 
                (wplsReserve * 1e18) / stateReserve;
                
            if (ratio > req.maxImbalanceRatio) {
                return (false, "Pool too imbalanced");
            }
            
            return (true, "Pool balance is acceptable");
        } catch {
            return (false, "Cannot verify pool balance");
        }
    }
    
    /**
     * @notice Validate pool stability and age
     */
    function _verifyPoolStability(address pool) private view returns (bool, string memory) {
        PoolRequirements memory req = getPoolRequirements();
        
        try IPulseXPair(pool).getReserves() returns (
            uint112, uint112, uint32 timestamp
        ) {
            uint256 poolAge = block.timestamp - uint256(timestamp);
            
            if (poolAge < req.minPoolAge) {
                return (false, "Pool too new - potential manipulation risk");
            }
            
            // Check if reserves are too stale (indicating no recent activity)
            if (block.timestamp - uint256(timestamp) > 30 minutes) {
                return (false, "Pool reserves are stale - no recent activity");
            }
            
            return (true, "Pool is stable");
        } catch {
            return (false, "Cannot verify pool stability");
        }
    }
    
    /**
     * @notice Comprehensive pool validation with all checks
     */
    function _validatePoolDetails(address pool, address stateToken, address wplsToken) 
        private view returns (bool isValid, string memory reason) 
    {
        // Verify pool is a contract
        if (pool.code.length == 0) return (false, "Pool not a contract");
        
        // Verify pool tokens match expected
        (bool tokenMatch, string memory tokenReason) = _verifyPoolTokens(pool, stateToken, wplsToken);
        if (!tokenMatch) return (false, tokenReason);
        
        // Verify reserves
        (bool reservesValid, string memory reserveReason) = _verifyPoolReserves(pool);
        if (!reservesValid) return (false, reserveReason);
        
        // Verify liquidity
        (bool liquidityValid, string memory liquidityReason) = _verifyPoolLiquidity(pool);
        if (!liquidityValid) return (false, liquidityReason);
        
        // Verify balance
        (bool balanceValid, string memory balanceReason) = _verifyPoolBalance(pool, stateToken, wplsToken);
        if (!balanceValid) return (false, balanceReason);
        
        return (true, "Pool is fully functional");
    }
    
    /**
     * @notice Verify pool contains the expected tokens
     */
    function _verifyPoolTokens(address pool, address stateToken, address wplsToken) 
        private view returns (bool, string memory) 
    {
        try IPulseXPair(pool).token0() returns (address token0) {
            try IPulseXPair(pool).token1() returns (address token1) {
                bool validPair = (token0 == stateToken && token1 == wplsToken) ||
                                (token0 == wplsToken && token1 == stateToken);
                
                if (!validPair) {
                    return (false, "Pool tokens do not match STATE/WPLS");
                }
                
                return (true, "Pool tokens match");
            } catch {
                return (false, "Cannot read token1 from pool");
            }
        } catch {
            return (false, "Cannot read token0 from pool");
        }
    }
}