import { getAddress, getRuntimeConfigSync } from "./RuntimeConfig";
// Chain IDs
export const CHAIN_IDS = {
    PULSECHAIN: 369,
    POLYGON: 137,
    SONIC: 146,
    MAINNET: 1,
    PULSECHAIN_TESTNET: 943,
};

// Contract addresses organized by chain
export const CONTRACT_ADDRESSES = {
    [CHAIN_IDS.PULSECHAIN]: {
        DAV_TOKEN: getAddress('contracts.core.DAV_V3', "0xE843FE90dF63659d1957237ee8E91232Eedd36B3"),
    STATE_TOKEN: getAddress('contracts.core.STATE_V3', "0xd290bC9cFaEdf2A90174f669BF9Aad7E71180451"),
    AUCTION: getAddress('contracts.core.SWAP_V3', "0xad63be034EB210e8870Ddb22541856f96302C344"),
        LP_HELPER: getAddress('contracts.utilities.LPHelper', ""), // Deprecated - use SWAP_V3.createPoolOneClick()
        LIQUIDITY_MANAGER: getAddress('contracts.utilities.LiquidityManager', ""), // TODO: Add deployed address
    BUY_BURN_CONTROLLER: getAddress('contracts.support.BuyAndBurnController', "0xe90444017e9349Dd62abC09FE26e6907E6350C56"),
        AUCTION_METRICS: getAddress('contracts.support.AuctionMetrics', ""), // Not deployed in this sequence
        SWAP_LENS: getAddress('contracts.support.SwapLens', "0xAF2190CC157b184A371016Ca0EA471D6bFdbF541"),
        AIRDROP_DISTRIBUTOR: getAddress('contracts.stages.AirdropDistributor', "0x5346B394b5b36D6d9f1fE4785D56C0D4644085d3"),
        AUCTION_ADMIN: getAddress('contracts.stages.AuctionAdmin', "0x5094FA04929684b6904bb9184f813D686906533a"),
    },
    [CHAIN_IDS.POLYGON]: {
        DAV_TOKEN: "", 
        STATE_TOKEN: "",
        AUCTION: "",
        LP_HELPER: "",
        LIQUIDITY_MANAGER: "",
        BUY_BURN_CONTROLLER: "",
        AUCTION_METRICS: "",
    },
    [CHAIN_IDS.MAINNET]: {
        DAV_TOKEN: "",
        STATE_TOKEN: "",
        AUCTION: "",
        LP_HELPER: "",
        LIQUIDITY_MANAGER: "",
        BUY_BURN_CONTROLLER: "",
        AUCTION_METRICS: "",
    },
};

// Helper function to get contract addresses for a specific chain
export const getContractAddresses = (chainId) => {
    return CONTRACT_ADDRESSES[chainId] || CONTRACT_ADDRESSES[CHAIN_IDS.PULSECHAIN];
};

// Helper function to get a specific contract address
export const getContractAddress = (chainId, contractType) => {
    const addresses = getContractAddresses(chainId);
    return addresses[contractType];
};

// Simple functions to get contract addresses for connected chain
export const getDAVContractAddress = (chainId) => {
    return getContractAddress(chainId, 'DAV_TOKEN') || getContractAddress(CHAIN_IDS.PULSECHAIN, 'DAV_TOKEN');
};

export const getSTATEContractAddress = (chainId) => {
    return getContractAddress(chainId, 'STATE_TOKEN') || getContractAddress(CHAIN_IDS.PULSECHAIN, 'STATE_TOKEN');
};

export const getAUCTIONContractAddress = (chainId) => {
    return getContractAddress(chainId, 'AUCTION') || getContractAddress(CHAIN_IDS.PULSECHAIN, 'AUCTION');
};
export const getSTATEPAIRAddress = (chainId) => {
    return getContractAddress(chainId, 'STATE_PAIR_ADDRESS') || getContractAddress(CHAIN_IDS.PULSECHAIN, 'STATE_PAIR_ADDRESS');
};
export const explorerUrls = {
    1: "https://etherscan.io/address/",          // Ethereum Mainnet
    137: "https://polygonscan.com/address/",     // Polygon Mainnet
    10: "https://optimistic.etherscan.io/address/", // Optimism
        369: (getRuntimeConfigSync()?.network?.explorerUrl || "https://scan.pulsechain.com") + "/address/",        // PulseChain Mainnet
};

// Get all contract addresses for a chain
export const getContractAddressesForChain = (chainId) => {
    return {
        DAV_TOKEN: getDAVContractAddress(chainId),
        STATE_TOKEN: getSTATEContractAddress(chainId),
        AUCTION: getAUCTIONContractAddress(chainId),
        SWAP_LENS: getContractAddress(chainId, 'SWAP_LENS'),
        LP_HELPER: getContractAddress(chainId, 'LP_HELPER'),
        LIQUIDITY_MANAGER: getContractAddress(chainId, 'LIQUIDITY_MANAGER'),
        BUY_BURN_CONTROLLER: getContractAddress(chainId, 'BUY_BURN_CONTROLLER'),
        AUCTION_METRICS: getContractAddress(chainId, 'AUCTION_METRICS'),
        AIRDROP_DISTRIBUTOR: getContractAddress(chainId, 'AIRDROP_DISTRIBUTOR'),
        AUCTION_ADMIN: getContractAddress(chainId, 'AUCTION_ADMIN'),
    };
};