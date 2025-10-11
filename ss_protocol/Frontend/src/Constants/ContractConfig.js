import DavTokenABI from "../ABI/DavToken.json";
import StateTokenABI from "../ABI/StateToken.json";
import AuctionSwapABI from "../ABI/AuctionSwap.json";
import AirdropDistributorABI from "../ABI/AirdropDistributor.json";
import SwapLensABI from "../ABI/SwapLens.json";
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
	{"type":"function","name":"setRouter","inputs":[{"name":"router","type":"address"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setRatio","inputs":[{"name":"base","type":"address"},{"name":"baseUnit","type":"uint256"},{"name":"stateUnit","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setPolicy","inputs":[{"name":"num","type":"uint256"},{"name":"den","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setExecutor","inputs":[{"name":"account","type":"address"},{"name":"allowed","type":"bool"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"executeBuyAndBurn","inputs":[{"name":"auctionId","type":"uint256"},{"name":"minStateOut","type":"uint256"},{"name":"minBase","type":"uint256"},{"name":"deadline","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},

	// Added pool creation & setup functions used by UI
	{"type":"function","name":"setStateWplsPool","inputs":[{"name":"poolAddress","type":"address"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"setupSwapVaultAllowance","inputs":[{"name":"amount","type":"uint256"}],"outputs":[],"stateMutability":"nonpayable"},
	{"type":"function","name":"createPoolOneClick","inputs":[{"name":"stateAmount","type":"uint256"},{"name":"wplsAmount","type":"uint256"}],"outputs":[],"stateMutability":"payable"},
	{"type":"function","name":"stateWplsPool","inputs":[],"outputs":[{"type":"address"}],"stateMutability":"view"},
	{"type":"function","name":"getControllerStatus","inputs":[],"outputs":[{"name":"plsBalance","type":"uint256"},{"name":"wplsBalance","type":"uint256"},{"name":"stateBalance","type":"uint256"},{"name":"poolAddress","type":"address"},{"name":"poolStateReserve","type":"uint256"},{"name":"poolWplsReserve","type":"uint256"}],"stateMutability":"view"}
	,
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

const BOOST_MIN_ABI = [
  {"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"getDailyCapInfo","inputs":[],"outputs":[{"name":"windowStart","type":"uint256"},{"name":"usedUnits","type":"uint256"},{"name":"capUnits","type":"uint256"}],"stateMutability":"view"}
];

const REVERSE_MIN_ABI = [
  {"type":"function","name":"pause","inputs":[],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"unpause","inputs":[],"outputs":[],"stateMutability":"nonpayable"}
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
			abi: DavTokenABI 
		},
		AuctionContract: { 
			address: addresses.AUCTION, 
			abi: AuctionSwapABI
		},
		stateContract: { 
			address: addresses.STATE_TOKEN, 
			abi: StateTokenABI 
		},
		swapLens: {
			address: addresses.SWAP_LENS,
			abi: SwapLensABI || SWAP_LENS_MIN_ABI,
		},
    lpHelper: {
      address: addresses.LP_HELPER,
      abi: LP_HELPER_MIN_ABI,
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
			abi: AirdropDistributorABI,
		},
		boostedRedemption: {
			address: addresses.BOOSTED_REDEMPTION,
			abi: BOOST_MIN_ABI,
		},
		reverseBurnRedemption: {
			address: addresses.REVERSE_BURN_REDEMPTION,
			abi: REVERSE_MIN_ABI,
		},
	};
};

// Get contract configs for a specific chain
export const getContractConfigsForChain = (chainId) => {
	const addresses = getContractAddresses(chainId);
	
	return {
		davContract: { 
			address: addresses.DAV_TOKEN, 
			abi: DavTokenABI 
		},
		AuctionContract: { 
			address: addresses.AUCTION, 
			abi: AuctionSwapABI
		},
		stateContract: { 
			address: addresses.STATE_TOKEN, 
			abi: StateTokenABI 
		},
		swapLens: {
			address: addresses.SWAP_LENS,
			abi: SwapLensABI || SWAP_LENS_MIN_ABI,
		},
    lpHelper: {
      address: addresses.LP_HELPER,
      abi: LP_HELPER_MIN_ABI,
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
			abi: AirdropDistributorABI,
		},
		boostedRedemption: {
			address: addresses.BOOSTED_REDEMPTION,
			abi: BOOST_MIN_ABI,
		},
		reverseBurnRedemption: {
			address: addresses.REVERSE_BURN_REDEMPTION,
			abi: REVERSE_MIN_ABI,
		},
	};
};

// Check if a chain is supported
export const isChainSupported = (chainId) => {
	const supportedChains = Object.values(CHAIN_IDS);
	return supportedChains.includes(chainId);
};

// Legacy function for backward compatibility
const getDavABI = () => DavTokenABI;

// Legacy export for backward compatibility - now uses dynamic addresses
export const getLegacyContractConfigs = () => ({
	davContract: { address: getDAVContractAddress(currentChainId), abi: getDavABI() },
	AuctionContract: { address: getAUCTIONContractAddress(currentChainId), abi: AuctionSwapABI },
	stateContract: { address: getSTATEContractAddress(currentChainId), abi: StateTokenABI },
});
