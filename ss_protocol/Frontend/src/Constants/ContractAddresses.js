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
        DAV_TOKEN: getAddress('contracts.core.DAV_V3', "0x42107c7441f0A3E1CB3Dba948597c39615765227"),
        STATE_TOKEN: getAddress('contracts.core.STATE_V3', "0x9454Eb295d8E4d871d724013dffd2301C486FD07"),
        AUCTION: getAddress('contracts.core.SWAP_V3', "0xeA55dB9Ae0eAfD245720563583871CE9ED549772"),
        LP_HELPER: getAddress('contracts.utilities.LPHelper', "0x967c15FcB0ED957ab8d406721E12C95BD859c898"),
        BUY_BURN_CONTROLLER: getAddress('contracts.support.BuyAndBurnController', "0x1bEAfD2cdffCD2867914B3fD6cfe92883ad3A687"),
        AUCTION_METRICS: getAddress('contracts.support.AuctionMetrics', "0xa309168C3Ea046305cCf453B1b8470319DF70780"),
        SWAP_LENS: getAddress('contracts.support.SwapLens', "0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0"),
        AIRDROP_DISTRIBUTOR: getAddress('contracts.stages.AirdropDistributor', "0x2C7725F02235BA3387369560A7Ea16a61778D6ff"),
        AUCTION_ADMIN: getAddress('contracts.stages.AuctionAdmin', "0x9a64Db2Eb8e6b01a517B1C96F325fa5103a589Ad"),
    },
    [CHAIN_IDS.POLYGON]: {
        DAV_TOKEN: "", 
        STATE_TOKEN: "",
        AUCTION: "",
        LP_HELPER: "",
        BUY_BURN_CONTROLLER: "",
        AUCTION_METRICS: "",
    },
    [CHAIN_IDS.MAINNET]: {
        DAV_TOKEN: "",
        STATE_TOKEN: "",
        AUCTION: "",
        LP_HELPER: "",
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
        BUY_BURN_CONTROLLER: getContractAddress(chainId, 'BUY_BURN_CONTROLLER'),
        AUCTION_METRICS: getContractAddress(chainId, 'AUCTION_METRICS'),
    };
};