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
        DAV_TOKEN: getAddress('contracts.core.DAV_V3', "0x03843b39d27dA897fD3896f8E2BDF0f2f1b6CBcd"),
        STATE_TOKEN: getAddress('contracts.core.STATE_V3', "0x8a1e26C63017cE03e7618e6DEDFA58CA2317AA1a"),
        AUCTION: getAddress('contracts.core.SWAP_V3', "0x0aa148D71361CAE3689bfe7897ef18979b3689C5"),
        LP_HELPER: getAddress('contracts.utilities.LPHelper', "0xea5412ECcD8b4b7Ad27EE366dA84F3464Ac3D347"),
        LIQUIDITY_MANAGER: getAddress('contracts.utilities.LiquidityManager', ""), // TODO: Add deployed address
        BUY_BURN_CONTROLLER: getAddress('contracts.support.BuyAndBurnController', "0x50167F148fC386c6e3bEbEaD7B0A7A5D0bd74438"),
        AUCTION_METRICS: getAddress('contracts.support.AuctionMetrics', "0xa309168C3Ea046305cCf453B1b8470319DF70780"),
        SWAP_LENS: getAddress('contracts.support.SwapLens', "0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0"),
        AIRDROP_DISTRIBUTOR: getAddress('contracts.stages.AirdropDistributor', "0x767048b336F3d90C385Ede970c9894b6d11436Ac"),
        AUCTION_ADMIN: getAddress('contracts.stages.AuctionAdmin', "0xD27f73077C87eD5485269aACF324cC6f587d9E3b"),
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
    };
};