import DavTokenABI from "../ABI/DavToken.json";
import StateTokenABI from "../ABI/StateToken.json";
// Use the full AuctionSwap ABI to ensure all read functions are available
// Use the extended ABI so admin + initialization getters/setters are available
import AuctionSwapABI from "../ABI/SWAP_V3_EXTENDED.json";
import AirdropDistributorABI from "../ABI/AirdropDistributor.json";
import AuctionAdminABI from "../ABI/AuctionAdmin.json";
import SwapLensABI from "../ABI/SwapLens.json";
import LiquidityManagerABI from "../ABI/LiquidityManager.json";
import { 
  getContractAddresses, 
  CHAIN_IDS,
  getDAVContractAddress,
  getSTATEContractAddress,
  getAUCTIONContractAddress,
} from "./ContractAddresses";
// Minimal ABIs (methods used in Admin); replace with full ABIs if available
// Full SwapLens ABI available; keeping minimal for stability unless needed elsewhere
const SWAP_LENS_MIN_ABI = [
	{ "type":"function","name":"getTodayStatus","inputs":[{"name":"swap","type":"address"}],"outputs":[{"components":[{"name":"tokenOfDay","type":"address"},{"name":"activeWindow","type":"bool"},{"name":"isReverse","type":"bool"},{"name":"appearanceCount","type":"uint256"},{"name":"secondsLeft","type":"uint256"}],"type":"tuple"}],"stateMutability":"view" },
	{ "type":"function","name":"getDailyStateReleaseBreakdown","inputs":[{"name":"swap","type":"address"}],"outputs":[{"name":"dayIndex","type":"uint256"},{"name":"total","type":"uint256"},{"name":"normal","type":"uint256"},{"name":"reverse","type":"uint256"}],"stateMutability":"view" },
	{ "type":"function","name":"getScheduleConfig","inputs":[{"name":"swap","type":"address"}],"outputs":[{"name":"isSet","type":"bool"},{"name":"start","type":"uint256"},{"name":"daysLimit","type":"uint256"},{"name":"scheduledCount","type":"uint256"}],"stateMutability":"view" },
	{ "type":"function","name":"getScheduledTokens","inputs":[{"name":"swap","type":"address"}],"outputs":[{"name":"list","type":"address[]"}],"stateMutability":"view" }
];
const LP_HELPER_MIN_ABI = [
	// config setters
	{ "type":"function","name":"useMainnet","inputs":[],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"setRouterFactory","inputs":[{"name":"router","type":"address"},{"name":"factory","type":"address"}],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"setSwap","inputs":[{"name":"swap","type":"address"}],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"enableTimelock","inputs":[],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"proposeRouterFactory","inputs":[{"name":"router","type":"address"},{"name":"factory","type":"address"}],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"executeRouterFactory","inputs":[],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"proposeSwap","inputs":[{"name":"swap","type":"address"}],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"executeSwap","inputs":[],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"setMaxSlippageBps","inputs":[{"name":"bps","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable" },
	{ "type":"function","name":"setMinDeadlineDelay","inputs":[{"name":"secondsDelay","type":"uint32"}],"outputs":[],"stateMutability":"nonpayable" },
	// reads for UX
	{ "type":"function","name":"router","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view" },
	{ "type":"function","name":"factory","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view" },
	{ "type":"function","name":"swap","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view" },
	{ "type":"function","name":"maxSlippageBps","inputs":[],"outputs":[{"type":"uint256"}],"stateMutability":"view" },
	{ "type":"function","name":"minDeadlineDelay","inputs":[],"outputs":[{"type":"uint32"}],"stateMutability":"view" },
	// action
	{ "type":"function","name":"createLPAndRegister","inputs":[
		{"name":"token","type":"address"},{"name":"tokenOwner","type":"address"},{"name":"amountStateDesired","type":"uint256"},{"name":"amountTokenDesired","type":"uint256"},{"name":"amountStateMin","type":"uint256"},{"name":"amountTokenMin","type":"uint256"},{"name":"deadline","type":"uint256"}
	],"outputs":[],"stateMutability":"nonpayable" }
];

const BUY_BURN_MIN_ABI = [
	// Admin controls (not all used in UI but kept for completeness)
	{"type":"function","name":"setRouter","inputs":[{"name":"router","type":"address"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setRatio","inputs":[{"name":"base","type":"address"},{"name":"baseUnit","type":"uint256"},{"name":"stateUnit","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setPolicy","inputs":[{"name":"num","type":"uint256"},{"name":"den","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setExecutor","inputs":[{"name":"account","type":"address"},{"name":"allowed","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},

	// V2 buy & burn functions (match deployed contract)
	{"type":"function","name":"executeBuyAndBurn","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"executeFullBuyAndBurn","inputs":[{"name":"plsAmountToUse","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"convertPLSToWPLS","inputs":[],"outputs":[],"stateMutability":"nonpayable"},

	// Pool creation & setup
	{"type":"function","name":"setStateWplsPool","inputs":[{"name":"poolAddress","type":"address"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setupSwapVaultAllowance","inputs":[{"name":"amount","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"createPoolOneClick","inputs":[{"name":"stateAmount","type":"uint256"},{"name":"wplsAmount","type":"uint256"}],"outputs":[],"stateMutability":"payable"},
	{"type":"function","name":"addMoreLiquidity","inputs":[{"name":"stateAmount","type":"uint256"},{"name":"wplsAmount","type":"uint256"}],"outputs":[{"name":"liquidity","type":"uint256"}],"stateMutability":"payable"},
	{"type":"function","name":"stateWplsPool","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"getControllerStatus","inputs":[],"outputs":[{"name":"plsBalance","type":"uint256"},{"name":"wplsBalance","type":"uint256"},{"name":"stateBalance","type":"uint256"},{"name":"poolAddress","type":"address"},{"name":"poolStateReserve","type":"uint256"},{"name":"poolWplsReserve","type":"uint256"}],"stateMutability":"view"},

	// Core immutable/public vars for diagnostics
	{"type":"function","name":"STATE","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"WPLS","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"ROUTER","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"FACTORY","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"SWAP_VAULT","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"SWAP","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"owner","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"}
];

const METRICS_MIN_ABI = [
	{"type":"function","name":"finalize","inputs":[{"name":"auctionId","type":"uint256"},{"name":"tokenIn","type":"address"},{"name":"amountIn","type":"uint256"},{"name":"amountInPLS","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setEnforceSequential","inputs":[{"name":"enabled","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setEnforceValidToken","inputs":[{"name":"enabled","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setValidAuctionToken","inputs":[{"name":"token","type":"address"},{"name":"allowed","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"}
];

// Distributors and reverse day modules (owner pause/unpause and small extras)
const AIRDROP_MIN_ABI = [
  {"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"setConsumer","inputs":[{"name":"consumer","type":"address"},{"name":"allowed","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"}
];

const LIQUIDITY_MANAGER_MIN_ABI = [
	{"type":"function","name":"addLiquidityToExistingPool","inputs":[{"name":"token","type":"address"},{"name":"tokenAmount","type":"uint256"},{"name":"stateAmount","type":"uint256"}],"outputs":[{"name":"liquidity","type":"uint256"}],"stateMutability":"nonpayable"},
	{"type":"function","name":"swapVault","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"stateToken","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"router","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"factory","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"owner","inputs":[],"outputs":[{"name":"","type":"address"}],"stateMutability":"view"},
	{"type":"event","name":"LiquidityAdded","inputs":[{"name":"pool","type":"address","indexed":true},{"name":"token","type":"address","indexed":true},{"name":"tokenUsed","type":"uint256","indexed":false},{"name":"stateUsed","type":"uint256","indexed":false},{"name":"liquidityBurned","type":"uint256","indexed":false}],"anonymous":false}
];

let currentChainId = CHAIN_IDS.PULSECHAIN; // Default chainId

export const setChainId = (chainId) => {
	currentChainId = chainId;
};

export const getCurrentChainId = () => {
	return currentChainId;
};

// Get contract configs for the current chain
export const getContractConfigs = () => {
	const addresses = getContractAddresses(currentChainId);
	
	return {
		davContract: { 
			address: addresses.DAV_TOKEN, 
			abi: DavTokenABI.abi || DavTokenABI 
		},
		AuctionContract: { 
			address: addresses.AUCTION, 
			abi: AuctionSwapABI.abi || AuctionSwapABI
		},
		stateContract: { 
			address: addresses.STATE_TOKEN, 
			abi: StateTokenABI.abi || StateTokenABI 
		},
		swapLens: {
			address: addresses.SWAP_LENS,
			abi: SwapLensABI.abi || SwapLensABI || SWAP_LENS_MIN_ABI,
		},
    lpHelper: {
      address: addresses.LP_HELPER,
      abi: LP_HELPER_MIN_ABI,
    },
    liquidityManager: {
      address: addresses.LIQUIDITY_MANAGER,
      abi: LiquidityManagerABI.abi || LiquidityManagerABI || LIQUIDITY_MANAGER_MIN_ABI,
    },
    buyBurnController: {
      address: addresses.BUY_BURN_CONTROLLER,
      abi: BUY_BURN_MIN_ABI,
    },
    auctionMetrics: {
      address: addresses.AUCTION_METRICS,
      abi: METRICS_MIN_ABI,
    },
		airdropDistributor: {
			address: addresses.AIRDROP_DISTRIBUTOR,
			abi: AirdropDistributorABI.abi || AirdropDistributorABI,
		},
		auctionAdmin: {
			address: addresses.AUCTION_ADMIN,
			abi: AuctionAdminABI.abi || AuctionAdminABI,
		},
	};
};

// Get contract configs for a specific chain
export const getContractConfigsForChain = (chainId) => {
	const addresses = getContractAddresses(chainId);
	
	return {
		davContract: { 
			address: addresses.DAV_TOKEN, 
			abi: DavTokenABI.abi || DavTokenABI 
		},
		AuctionContract: { 
			address: addresses.AUCTION, 
			abi: AuctionSwapABI.abi || AuctionSwapABI
		},
		stateContract: { 
			address: addresses.STATE_TOKEN, 
			abi: StateTokenABI.abi || StateTokenABI 
		},
		swapLens: {
			address: addresses.SWAP_LENS,
			abi: SwapLensABI.abi || SwapLensABI || SWAP_LENS_MIN_ABI,
		},
    lpHelper: {
      address: addresses.LP_HELPER,
      abi: LP_HELPER_MIN_ABI,
    },
    liquidityManager: {
      address: addresses.LIQUIDITY_MANAGER,
      abi: LiquidityManagerABI.abi || LiquidityManagerABI || LIQUIDITY_MANAGER_MIN_ABI,
    },
    buyBurnController: {
      address: addresses.BUY_BURN_CONTROLLER,
      abi: BUY_BURN_MIN_ABI,
    },
    auctionMetrics: {
      address: addresses.AUCTION_METRICS,
      abi: METRICS_MIN_ABI,
    },
		airdropDistributor: {
			address: addresses.AIRDROP_DISTRIBUTOR,
			abi: AirdropDistributorABI.abi || AirdropDistributorABI,
		},
		auctionAdmin: {
			address: addresses.AUCTION_ADMIN,
			abi: AuctionAdminABI.abi || AuctionAdminABI,
		},
	};
};

// Check if a chain is supported
export const isChainSupported = (chainId) => {
	const supportedChains = Object.values(CHAIN_IDS);
	return supportedChains.includes(chainId);
};

// Legacy function for backward compatibility
const getDavABI = () => DavTokenABI.abi || DavTokenABI;

// Legacy export for backward compatibility - now uses dynamic addresses
export const getLegacyContractConfigs = () => ({
	davContract: { address: getDAVContractAddress(currentChainId), abi: getDavABI() },
	AuctionContract: { address: getAUCTIONContractAddress(currentChainId), abi: AuctionSwapABI.abi || AuctionSwapABI },
	stateContract: { address: getSTATEContractAddress(currentChainId), abi: StateTokenABI.abi || StateTokenABI },
});
