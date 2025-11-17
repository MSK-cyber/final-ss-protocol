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
        DAV_TOKEN: getAddress('contracts.core.DAV_V3', "0xb8bC708aF8dc74DeFAff6A45708f37E046B1498d"),
    STATE_TOKEN: getAddress('contracts.core.STATE_V3', "0x72f55666a5CfB5a7C179F9E829402C34bd0708Bd"),
    AUCTION: getAddress('contracts.core.SWAP_V3', "0x329390c539008885491a09Df6798267e643182A1"),
        LP_HELPER: getAddress('contracts.utilities.LPHelper', ""), // Deprecated - use SWAP_V3.createPoolOneClick()
        LIQUIDITY_MANAGER: getAddress('contracts.utilities.LiquidityManager', ""), // TODO: Add deployed address
    BUY_BURN_CONTROLLER: getAddress('contracts.support.BuyAndBurnController', "0xF6Cd74d4DEdB69bE6824F51d669D5F3483962335"),
        AUCTION_METRICS: getAddress('contracts.support.AuctionMetrics', ""), // Not deployed in this sequence
        SWAP_LENS: getAddress('contracts.support.SwapLens', "0x458D1e955374f3a45278B38ac7ae75bCFfc1c444"),
        AIRDROP_DISTRIBUTOR: getAddress('contracts.stages.AirdropDistributor', "0x0d0F194f1d2652185F42148b584F8381a5c3545F"),
        AUCTION_ADMIN: getAddress('contracts.stages.AuctionAdmin', "0x3F3350E7Cc9F1309182E3280eF9aBB4d042d6aB4"),
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