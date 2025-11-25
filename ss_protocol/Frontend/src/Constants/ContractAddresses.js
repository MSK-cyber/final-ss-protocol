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
        DAV_TOKEN: getAddress('contracts.core.DAV_V3', "0xf01D3b66458Ef4a419679480ba59ADf646E4c838"),
    STATE_TOKEN: getAddress('contracts.core.STATE_V3', "0x834A4eE2849E25b94A4aB6bC19D3CD0542256244"),
    AUCTION: getAddress('contracts.core.SWAP_V3', "0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A"),
        LP_HELPER: getAddress('contracts.utilities.LPHelper', ""), // Deprecated - use SWAP_V3.createPoolOneClick()
        LIQUIDITY_MANAGER: getAddress('contracts.utilities.LiquidityManager', ""), // TODO: Add deployed address
    BUY_BURN_CONTROLLER: getAddress('contracts.support.BuyAndBurnController', "0x1ACC1dc6E734A0fb7ca8Ab128F3D34f20092bC11"),
        AUCTION_METRICS: getAddress('contracts.support.AuctionMetrics', ""), // Not deployed in this sequence
        SWAP_LENS: getAddress('contracts.support.SwapLens', "0x82c3491e629Da99b785FFBb86cec02a77E5732Fb"),
        AIRDROP_DISTRIBUTOR: getAddress('contracts.stages.AirdropDistributor', "0x99F563cb688834134668858837dF97d50346F906"),
        AUCTION_ADMIN: getAddress('contracts.stages.AuctionAdmin', "0xA001442C5147BBCbA73CafA86Ef90225086cF7e1"),
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