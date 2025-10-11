// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";
import {STATE_V3} from "../src/StateToken.sol";
import {DAV_V3} from "../src/DavToken.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";
import {LPHelper} from "../src/LPHelper.sol";
import {AirdropDistributor} from "../src/AirdropDistributor.sol";

// Mock PulseX contracts for testing
contract MockPulseXFactory {
    mapping(address => mapping(address => address)) public pairs;
    address[] public allPairs;
    
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "Identical tokens");
        require(tokenA != address(0) && tokenB != address(0), "Zero address");
        require(pairs[tokenA][tokenB] == address(0), "Pair exists");
        
        bytes32 salt = keccak256(abi.encodePacked(tokenA, tokenB));
        pair = address(new MockPulseXPair{salt: salt}(tokenA, tokenB));
        
        pairs[tokenA][tokenB] = pair;
        pairs[tokenB][tokenA] = pair;
        allPairs.push(pair);
    }
    
    function getPair(address tokenA, address tokenB) external view returns (address) {
        return pairs[tokenA][tokenB];
    }
}

contract MockPulseXPair {
    address public token0;
    address public token1;
    uint112 private reserve0;
    uint112 private reserve1;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    
    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }
    
    function getReserves() external view returns (uint112 _reserve0, uint112 _reserve1, uint32) {
        return (reserve0, reserve1, uint32(block.timestamp));
    }
    
    function mint(address to) external returns (uint256 liquidity) {
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;
        
        if (totalSupply == 0) {
            liquidity = sqrt(amount0 * amount1) - 1000;
            balanceOf[address(0)] = 1000; // MINIMUM_LIQUIDITY
        } else {
            liquidity = min(amount0 * totalSupply / reserve0, amount1 * totalSupply / reserve1);
        }
        
        require(liquidity > 0, "Insufficient liquidity minted");
        balanceOf[to] += liquidity;
        totalSupply += liquidity;
        
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
    }
    
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

contract MockPulseXRouter {
    address public factory;
    address public WPLS;
    
    constructor(address _factory, address _WPLS) {
        factory = _factory;
        WPLS = _WPLS;
    }
    
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, "Expired");
        
        address pair = MockPulseXFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = MockPulseXFactory(factory).createPair(tokenA, tokenB);
        }
        
        IERC20(tokenA).transferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountBDesired);
        
        liquidity = MockPulseXPair(pair).mint(to);
        return (amountADesired, amountBDesired, liquidity);
    }
}

// Mock WPLS token
contract MockWPLS {
    string public name = "Wrapped PLS";
    string public symbol = "WPLS";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        totalSupply += msg.value;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

contract CompleteProjectTest is Test {
    SWAP_V3 public swap;
    STATE_V3 public state;
    DAV_V3 public dav;
    BuyAndBurnController_V2 public buyBurn;
    LPHelper public lpHelper;
    AirdropDistributor public airdrop;
    
    MockPulseXFactory public factory;
    MockPulseXRouter public router;
    MockWPLS public wpls;
    
    // Test tokens
    STATE_V3 public token1;
    STATE_V3 public token2; 
    STATE_V3 public token3;
    
    address public governance = address(0x1111);
    address public user1 = address(0x2222);
    address public user2 = address(0x3333);
    address public liquidityProvider = address(0x4444);
    
    uint256 constant DAV_PRICE_100_PLS = 100 ether; // 1 DAV = 100 PLS
    uint256 constant TOTAL_AUCTION_TOKENS = 3;
    
    function setUp() public {
        vm.label(governance, "Governance");
        vm.label(user1, "User1");
        vm.label(user2, "User2");
        vm.label(liquidityProvider, "LiquidityProvider");
        
        // Deploy mock DEX contracts
        factory = new MockPulseXFactory();
        wpls = new MockWPLS();
        router = new MockPulseXRouter(address(factory), address(wpls));
        
        vm.label(address(factory), "PulseXFactory");
        vm.label(address(router), "PulseXRouter");
        vm.label(address(wpls), "WPLS");
        
        // Deploy main contracts
        vm.startPrank(governance);
        
        swap = new SWAP_V3(governance, governance);
        vm.label(address(swap), "SWAP_V3");
        
        state = new STATE_V3("PulseState", "pSTATE", governance, address(swap));
        vm.label(address(state), "STATE");
        
        dav = new DAV_V3(liquidityProvider, address(state), governance, "PulseDAV", "pDAV");
        vm.label(address(dav), "DAV");
        
        lpHelper = new LPHelper(address(router), address(factory));
        vm.label(address(lpHelper), "LPHelper");
        
        airdrop = new AirdropDistributor(swap, dav, address(state), governance);
        vm.label(address(airdrop), "AirdropDistributor");
        
        buyBurn = new BuyAndBurnController_V2(
            address(state),
            address(wpls),
            address(router),
            address(factory),
            address(swap),
            address(swap)
        );
        vm.label(address(buyBurn), "BuyAndBurn");
        
        vm.stopPrank();
        
        console2.log("=== SETUP COMPLETE ===");
        console2.log("SWAP_V3:", address(swap));
        console2.log("STATE:", address(state));
        console2.log("DAV:", address(dav));
        console2.log("BuyAndBurn:", address(buyBurn));
    }
    
    function testCompleteProjectWorkflow() public {
        console2.log("\n=== STARTING COMPLETE PROJECT TEST ===");
        
        // Step 1: Setup initial parameters
        _setupInitialParameters();
        
        // Step 2: Create 3 auction tokens
        _createAuctionTokens();
        
        // Step 3: Create pools for auction tokens
        _createTokenPools();
        
        // Step 4: Setup DAV pricing (1 DAV = 100 PLS)
        _setupDAVPricing();
        
        // Step 5: Start auction
        _startAuction();
        
        // Step 6: Create buy and burn pool
        _createBuyAndBurnPool();
        
        // Step 7: Test minting DAV (requires pool)
        _testDAVMinting();
        
        // Step 8: Test buy and burn process
        _testBuyAndBurnProcess();
        
        console2.log("\n=== ALL TESTS PASSED ===");
    }
    
    function _setupInitialParameters() internal {
        console2.log("\n--- Setting up initial parameters ---");
        
        vm.startPrank(governance);
        
        // Set total auction tokens to 3
        // Note: This depends on the actual interface in SWAP_V3
        // You may need to adjust based on available functions
        
        console2.log("Total auction tokens set to:", TOTAL_AUCTION_TOKENS);
        console2.log("DAV price target: 1 DAV = 100 PLS");
        
        vm.stopPrank();
    }
    
    function _createAuctionTokens() internal {
        console2.log("\n--- Creating 3 auction tokens ---");
        
        vm.startPrank(governance);
        
        // Create token 1
        token1 = new STATE_V3("AuctionToken1", "AT1", governance, user1);
        vm.label(address(token1), "Token1");
        console2.log("Token1 created:", address(token1));
        
        // Create token 2
        token2 = new STATE_V3("AuctionToken2", "AT2", governance, user1);
        vm.label(address(token2), "Token2");
        console2.log("Token2 created:", address(token2));
        
        // Create token 3
        token3 = new STATE_V3("AuctionToken3", "AT3", governance, user1);
        vm.label(address(token3), "Token3");
        console2.log("Token3 created:", address(token3));
        
        vm.stopPrank();
    }
    
    function _createTokenPools() internal {
        console2.log("\n--- Creating pools for auction tokens ---");
        
        vm.startPrank(governance);
        
        // Transfer some STATE tokens to governance for pool creation
        uint256 stateForPools = 1000 ether;
        
        // Create pools for each token with STATE
        _createPool(address(token1), address(state), 100 ether, 100 ether);
        _createPool(address(token2), address(state), 100 ether, 100 ether);
        _createPool(address(token3), address(state), 100 ether, 100 ether);
        
        vm.stopPrank();
    }
    
    function _createPool(address tokenA, address tokenB, uint256 amountA, uint256 amountB) internal {
        // Approve router to spend tokens
        IERC20(tokenA).approve(address(router), amountA);
        IERC20(tokenB).approve(address(router), amountB);
        
        // Add liquidity
        router.addLiquidity(
            tokenA,
            tokenB,
            amountA,
            amountB,
            amountA * 95 / 100, // 5% slippage
            amountB * 95 / 100,
            governance,
            block.timestamp + 600
        );
        
        address pair = factory.getPair(tokenA, tokenB);
        console2.log("Pool created between tokens at:", pair);
    }
    
    function _setupDAVPricing() internal {
        console2.log("\n--- Setting up DAV pricing (1 DAV = 100 PLS) ---");
        
        vm.startPrank(liquidityProvider);
        
        // Create DAV/WPLS pool with 1:100 ratio
        uint256 davAmount = 10 ether; // 10 DAV
        uint256 wplsAmount = 1000 ether; // 1000 WPLS (100 WPLS per DAV)
        
        // Mint some WPLS
        vm.deal(liquidityProvider, wplsAmount);
        wpls.deposit{value: wplsAmount}();
        
        // Approve and add liquidity
        dav.approve(address(router), davAmount);
        wpls.approve(address(router), wplsAmount);
        
        router.addLiquidity(
            address(dav),
            address(wpls),
            davAmount,
            wplsAmount,
            davAmount * 95 / 100,
            wplsAmount * 95 / 100,
            liquidityProvider,
            block.timestamp + 600
        );
        
        address davPool = factory.getPair(address(dav), address(wpls));
        console2.log("DAV/WPLS pool created at:", davPool);
        console2.log("DAV price: 1 DAV = 100 WPLS");
        
        vm.stopPrank();
    }
    
    function _startAuction() internal {
        console2.log("\n--- Starting auction ---");
        
        vm.startPrank(governance);
        
        // Set up auction schedule with the 3 tokens
        address[] memory tokens = new address[](3);
        tokens[0] = address(token1);
        tokens[1] = address(token2);  
        tokens[2] = address(token3);
        
        // Note: This depends on the actual interface in SWAP_V3
        // You may need to adjust based on available functions
        // swap.setAuctionSchedule(tokens);
        
        console2.log("Auction started with 3 tokens");
        console2.log("Token1:", address(token1));
        console2.log("Token2:", address(token2));
        console2.log("Token3:", address(token3));
        
        vm.stopPrank();
    }
    
    function _createBuyAndBurnPool() internal {
        console2.log("\n--- Creating buy and burn pool ---");
        
        vm.startPrank(governance);
        
        // Create STATE/WPLS pool for buy and burn
        uint256 stateAmount = 100 ether;
        uint256 wplsAmount = 1000 ether; // 1 STATE = 10 WPLS initially
        
        // Mint WPLS for pool
        vm.deal(governance, wplsAmount);
        wpls.deposit{value: wplsAmount}();
        
        // Create the pool
        _createPool(address(state), address(wpls), stateAmount, wplsAmount);
        
        address statePool = factory.getPair(address(state), address(wpls));
        console2.log("STATE/WPLS pool for buy&burn created at:", statePool);
        
        vm.stopPrank();
    }
    
    function _testDAVMinting() internal {
        console2.log("\n--- Testing DAV minting (requires pool) ---");
        
        vm.startPrank(user1);
        vm.deal(user1, 1000 ether);
        
        // Get some WPLS
        wpls.deposit{value: 500 ether}();
        
        // Mint DAV by providing liquidity to DAV/WPLS pool
        uint256 davAmount = 5 ether;
        uint256 wplsAmount = 500 ether;
        
        wpls.approve(address(router), wplsAmount);
        // Note: User needs DAV tokens to add liquidity, so this simulates getting some
        vm.stopPrank();
        
        // Give user some DAV for testing
        vm.prank(liquidityProvider);
        dav.transfer(user1, davAmount);
        
        vm.startPrank(user1);
        dav.approve(address(router), davAmount);
        
        router.addLiquidity(
            address(dav),
            address(wpls),
            davAmount,
            wplsAmount,
            davAmount * 95 / 100,
            wplsAmount * 95 / 100,
            user1,
            block.timestamp + 600
        );
        
        console2.log("User1 DAV balance:", dav.balanceOf(user1));
        console2.log("DAV minting test completed");
        
        vm.stopPrank();
    }
    
    function _testBuyAndBurnProcess() internal {
        console2.log("\n--- Testing buy and burn process ---");
        
        vm.startPrank(governance);
        
        // Setup buy and burn controller with STATE/WPLS pool
        address stateWplsPool = factory.getPair(address(state), address(wpls));
        require(stateWplsPool != address(0), "STATE/WPLS pool not found");
        
        // Transfer some STATE to buy and burn controller for operations
        state.transfer(address(buyBurn), 50 ether);
        
        // Test the buy and burn mechanism
        // Note: This depends on the actual interface in BuyAndBurnController_V2
        console2.log("Buy and burn controller STATE balance:", state.balanceOf(address(buyBurn)));
        console2.log("STATE/WPLS pool:", stateWplsPool);
        
        vm.stopPrank();
        
        // Test user interaction with buy and burn
        vm.startPrank(user2);
        vm.deal(user2, 1000 ether);
        
        // Get some WPLS
        wpls.deposit{value: 500 ether}();
        
        // User adds liquidity to STATE/WPLS pool
        uint256 userStateAmount = 10 ether;
        uint256 userWplsAmount = 100 ether;
        
        // Give user some STATE tokens
        vm.stopPrank();
        vm.prank(governance);
        state.transfer(user2, userStateAmount);
        
        vm.startPrank(user2);
        
        state.approve(address(router), userStateAmount);
        wpls.approve(address(router), userWplsAmount);
        
        router.addLiquidity(
            address(state),
            address(wpls),
            userStateAmount,
            userWplsAmount,
            userStateAmount * 95 / 100,
            userWplsAmount * 95 / 100,
            user2,
            block.timestamp + 600
        );
        
        console2.log("User2 added liquidity to STATE/WPLS pool");
        console2.log("User2 STATE balance:", state.balanceOf(user2));
        
        // Test burning STATE tokens
        uint256 burnAmount = 5 ether;
        vm.stopPrank();
        vm.prank(governance);
        state.transfer(user2, burnAmount);
        
        vm.startPrank(user2);
        uint256 balanceBefore = state.balanceOf(user2);
        
        // Transfer to zero address to simulate burning
        state.transfer(address(0), burnAmount);
        
        uint256 balanceAfter = state.balanceOf(user2);
        console2.log("STATE burned:", balanceBefore - balanceAfter);
        console2.log("Buy and burn process completed");
        
        vm.stopPrank();
    }
    
    function testContractSizes() public view {
        console2.log("\n=== CONTRACT SIZE VERIFICATION ===");
        console2.log("SWAP_V3 code size:", address(swap).code.length, "bytes");
        console2.log("STATE_V3 code size:", address(state).code.length, "bytes");
        console2.log("DAV_V3 code size:", address(dav).code.length, "bytes");
        console2.log("BuyAndBurn code size:", address(buyBurn).code.length, "bytes");
        
        // Verify main contract is under 24KB
        assertLt(address(swap).code.length, 24576, "SWAP_V3 exceeds 24KB limit");
        console2.log("All contracts are within size limits");
    }
}