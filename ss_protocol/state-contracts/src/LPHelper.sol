// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ISwapLike {
    function stateToken() external view returns (address);
    function registerTokenWithPair(address token, address tokenOwner, address pairAddress) external;
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPulseXRouter02 {
    function factory() external view returns (address);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IPair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

contract LPHelper is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Errors ============
    error BadAddress();
    error NotAContract();
    error NoSwap();
    error NoState();
    error BadAmount();
    error PairInvalid();
    error RouterFactoryMismatch();
    error DeadlineExpired();
    error TimelockEnforced();
    error InvalidBps();

    // PulseChain mainnet
    address public constant MAINNET_PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address public constant MAINNET_PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    address public router;
    address public factory;
    ISwapLike public swap;

    // Optional governance slippage guard (0 = disabled)
    // Enforces: amountMin >= amountDesired * (10000 - maxSlippageBps) / 10000
    uint256 public maxSlippageBps; // basis points (1e4)

    // Optional one-way timelock for critical config
    bool public timelockEnabled;
    uint256 public constant TIMELOCK_DELAY = 2 days;
    struct PendingRouterFactory {
        address router;
        address factory;
        uint256 eta;
    }
    PendingRouterFactory public pendingRouterFactory;
    struct PendingSwap {
        address swap;
        uint256 eta;
    }
    PendingSwap public pendingSwap;

    event RouterFactoryUpdated(address indexed router, address indexed factory);
    event SwapSet(address indexed swap);
    event LiquidityAdded(address indexed token, address indexed pair, uint256 usedA, uint256 usedB, uint256 liquidity);
    event MaxSlippageBpsUpdated(uint256 bps);
    event TimelockEnabled();
    event RouterFactoryProposed(address indexed router, address indexed factory, uint256 eta);
    event RouterFactoryExecuted(address indexed router, address indexed factory);
    event SwapProposed(address indexed swap, uint256 eta);
    event SwapExecuted(address indexed swap);

    constructor(address _router, address _factory) {
        if (_router == address(0) || _factory == address(0)) revert BadAddress();
        // Validate contracts and router/factory relationship
        if (address(_router).code.length == 0) revert NotAContract();
        if (address(_factory).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(_router).factory() != _factory) revert RouterFactoryMismatch();
        router = _router;
        factory = _factory;
    }

    function useMainnet() external onlyOwner {
        router = MAINNET_PULSEX_ROUTER;
        factory = MAINNET_PULSEX_FACTORY;
        // Best-effort assertion that router/factory align
        if (address(IPulseXRouter02(router)).code.length == 0) revert NotAContract();
        if (address(IPulseXFactory(factory)).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(router).factory() != factory) revert RouterFactoryMismatch();
        emit RouterFactoryUpdated(router, factory);
    }

    function setRouterFactory(address _router, address _factory) external onlyOwner {
        if (timelockEnabled) revert TimelockEnforced();
        if (_router == address(0) || _factory == address(0)) revert BadAddress();
        if (address(_router).code.length == 0) revert NotAContract();
        if (address(_factory).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(_router).factory() != _factory) revert RouterFactoryMismatch();
        router = _router;
        factory = _factory;
        emit RouterFactoryUpdated(_router, _factory);
    }

    function setSwap(address _swap) external onlyOwner {
        if (timelockEnabled) revert TimelockEnforced();
        if (_swap == address(0)) revert BadAddress();
        if (address(_swap).code.length == 0) revert NotAContract();
        // Validate state token presence and code
        address st = ISwapLike(_swap).stateToken();
        if (st == address(0)) revert NoState();
        if (address(st).code.length == 0) revert NotAContract();
        swap = ISwapLike(_swap);
        emit SwapSet(_swap);
    }

    // --- Optional timelock flow (irreversible enable) ---
    function enableTimelock() external onlyOwner {
        if (timelockEnabled) return;
        timelockEnabled = true;
        emit TimelockEnabled();
    }

    function proposeRouterFactory(address _router, address _factory) external onlyOwner {
        if (!timelockEnabled) revert TimelockEnforced();
        if (_router == address(0) || _factory == address(0)) revert BadAddress();
        if (address(_router).code.length == 0) revert NotAContract();
        if (address(_factory).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(_router).factory() != _factory) revert RouterFactoryMismatch();
        pendingRouterFactory = PendingRouterFactory({
            router: _router,
            factory: _factory,
            eta: block.timestamp + TIMELOCK_DELAY
        });
        emit RouterFactoryProposed(_router, _factory, pendingRouterFactory.eta);
    }

    function executeRouterFactory() external onlyOwner {
        if (!timelockEnabled) revert TimelockEnforced();
        PendingRouterFactory memory p = pendingRouterFactory;
        if (p.router == address(0) || p.factory == address(0)) revert BadAddress();
        if (block.timestamp < p.eta) revert DeadlineExpired();
        // Re-validate and apply
        if (address(p.router).code.length == 0) revert NotAContract();
        if (address(p.factory).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(p.router).factory() != p.factory) revert RouterFactoryMismatch();
        router = p.router;
        factory = p.factory;
        delete pendingRouterFactory;
        emit RouterFactoryUpdated(router, factory);
        emit RouterFactoryExecuted(router, factory);
    }

    function proposeSwap(address _swap) external onlyOwner {
        if (!timelockEnabled) revert TimelockEnforced();
        if (_swap == address(0)) revert BadAddress();
        if (address(_swap).code.length == 0) revert NotAContract();
        address st = ISwapLike(_swap).stateToken();
        if (st == address(0)) revert NoState();
        if (address(st).code.length == 0) revert NotAContract();
        pendingSwap = PendingSwap({swap: _swap, eta: block.timestamp + TIMELOCK_DELAY});
        emit SwapProposed(_swap, pendingSwap.eta);
    }

    function executeSwap() external onlyOwner {
        if (!timelockEnabled) revert TimelockEnforced();
        PendingSwap memory p = pendingSwap;
        if (p.swap == address(0)) revert BadAddress();
        if (block.timestamp < p.eta) revert DeadlineExpired();
        // Re-validate and apply
        if (address(p.swap).code.length == 0) revert NotAContract();
        address st = ISwapLike(p.swap).stateToken();
        if (st == address(0)) revert NoState();
        if (address(st).code.length == 0) revert NotAContract();
        swap = ISwapLike(p.swap);
        delete pendingSwap;
        emit SwapSet(address(swap));
        emit SwapExecuted(address(swap));
    }

    function setMaxSlippageBps(uint256 bps) external onlyOwner {
        // 0 disables enforcement; cap at 5000 = 50% to avoid absurd values
        if (bps > 5000) revert InvalidBps();
        maxSlippageBps = bps;
        emit MaxSlippageBpsUpdated(bps);
    }

    // Optional minimum deadline horizon for addLiquidity calls (default 0)
    uint32 public minDeadlineDelay;
    function setMinDeadlineDelay(uint32 secondsDelay) external onlyOwner {
        minDeadlineDelay = secondsDelay;
    }

    function _validateConfig() internal view {
        if (router == address(0) || factory == address(0)) revert BadAddress();
        if (address(router).code.length == 0) revert NotAContract();
        if (address(factory).code.length == 0) revert NotAContract();
        if (IPulseXRouter02(router).factory() != factory) revert RouterFactoryMismatch();
        if (address(swap) == address(0)) revert NoSwap();
        if (address(swap).code.length == 0) revert NotAContract();
    }

    function createLPAndRegister(
        address token,
        address tokenOwner,
        uint256 amountStateDesired,
        uint256 amountTokenDesired,
        uint256 amountStateMin,
        uint256 amountTokenMin,
        uint256 deadline
    ) external onlyOwner nonReentrant {
        _validateConfig();
        address stateToken = swap.stateToken();
        if (stateToken == address(0)) revert NoState();
        if (address(stateToken).code.length == 0) revert NotAContract();
        if (token == address(0) || tokenOwner == address(0)) revert BadAddress();
        if (token == stateToken) revert PairInvalid();
        if (amountStateDesired == 0 || amountTokenDesired == 0) revert BadAmount();
        // Require meaningful slippage bounds provided
        if (amountStateMin == 0 || amountTokenMin == 0) revert BadAmount();
        if (deadline < block.timestamp) revert DeadlineExpired();
        require(deadline >= block.timestamp + minDeadlineDelay, "deadline short");

        if (maxSlippageBps > 0) {
            uint256 minStateAllowed = (amountStateDesired * (10000 - maxSlippageBps)) / 10000;
            uint256 minTokenAllowed = (amountTokenDesired * (10000 - maxSlippageBps)) / 10000;
            require(amountStateMin >= minStateAllowed, "slippage-state");
            require(amountTokenMin >= minTokenAllowed, "slippage-token");
        }

        address provider = msg.sender;
        IERC20(stateToken).safeTransferFrom(provider, address(this), amountStateDesired);
        IERC20(token).safeTransferFrom(provider, address(this), amountTokenDesired);

        // Reconcile allowances precisely to avoid approve race patterns
        _ensureAllowance(IERC20(stateToken), router, amountStateDesired);
        _ensureAllowance(IERC20(token), router, amountTokenDesired);

        address pair = IPulseXFactory(factory).getPair(token, stateToken);
        if (pair == address(0)) {
            pair = IPulseXFactory(factory).createPair(token, stateToken);
            if (pair == address(0)) revert PairInvalid();
        }
        _validatePair(pair, stateToken, token);

        (uint256 usedToken, uint256 usedState, uint256 liquidity) = IPulseXRouter02(router).addLiquidity(
            token,
            stateToken,
            amountTokenDesired,
            amountStateDesired,
            amountTokenMin,
            amountStateMin,
            BURN,
            deadline
        );

        if (amountStateDesired > usedState) {
            IERC20(stateToken).safeTransfer(provider, amountStateDesired - usedState);
        }
        if (amountTokenDesired > usedToken) {
            IERC20(token).safeTransfer(provider, amountTokenDesired - usedToken);
        }
        // Optionally revoke excess allowance back to exact used amounts
        _ensureAllowance(IERC20(stateToken), router, usedState);
        _ensureAllowance(IERC20(token), router, usedToken);

        // Pair validated earlier

        swap.registerTokenWithPair(token, tokenOwner, pair);
        emit LiquidityAdded(token, pair, usedToken, usedState, liquidity);
    }

    // ============ Owner rescues ============
    event TokensRescued(address indexed token, address indexed to, uint256 amount);
    event ETHRescued(address indexed to, uint256 amount);

    function rescueTokens(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert BadAddress();
        IERC20(token).safeTransfer(to, amount);
        emit TokensRescued(token, to, amount);
    }

    function rescueETH(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadAddress();
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "ETH_TRANSFER_FAIL");
        emit ETHRescued(to, amount);
    }

    // --- Internal helpers ---
    function _ensureAllowance(IERC20 _token, address spender, uint256 amount) internal {
        uint256 current = _token.allowance(address(this), spender);
        if (current < amount) {
            _token.safeIncreaseAllowance(spender, amount - current);
        } else if (current > amount) {
            _token.safeDecreaseAllowance(spender, current - amount);
        }
    }

    function _validatePair(address pair, address stateToken, address token) internal view {
        if (address(pair).code.length == 0) revert PairInvalid();
        IPair p = IPair(pair);
        address t0 = p.token0();
        address t1 = p.token1();
        if (!((t0 == token && t1 == stateToken) || (t1 == token && t0 == stateToken))) revert PairInvalid();
        // Reserve read as liveness check; values can be zero for new pairs
        try p.getReserves() returns (uint112, uint112, uint32) {} catch { revert PairInvalid(); }
    }
}
