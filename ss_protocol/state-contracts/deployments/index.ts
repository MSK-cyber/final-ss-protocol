/**
 * State DEX Protocol V4 - Frontend Integration Package
 * 
 * This package provides all necessary files and type definitions for integrating
 * with State DEX Protocol V4 deployed on PulseChain v4 Testnet.
 * 
 * @version 4.0.0
 * @network PulseChain v4 Testnet (Chain ID: 943)
 * @status FULLY_DEPLOYED_AND_INTEGRATED
 */

// Import configuration and deployment data
import deploymentConfig from './pulsechain-testnet.json';
import protocolConfig from './config.json';
import contractAbis from './abis.json';

// Export all types
export * from './types';

// Export configurations
export { deploymentConfig, protocolConfig, contractAbis };

// Export contract addresses for easy access
export const CONTRACTS = {
  // Core Protocol
  SWAP_V3: '0x8E9B834bF7962C2Dc650FCF0BC1c2C51b99Fa7a1',
  STATE_V3: '0x0f18C35D5828322127D4b9955c4d48F32413716f',
  DAV_V3: '0xd20fEeCFCf838f95e7163ffA430a09F14aC7A73A',
  
  // Helper Contracts
  SwapLens: '0x324D5165a69de99537Cde406a1c1766bFe0e3D37',
  AuctionMetrics: '0xCC95D2126f1Fc3e57B4AB19d6D306c31D237B881',
  BuyAndBurnController: '0x2E1cafbbE927E870c2857905887Cb65826f53379',
  LPHelper: '0x6BD4B08F4563cB2AD1637E24eD6959a6c0c7a5b5',
  
  // Distribution Contracts
  AirdropDistributor: '0x9A7B27587D311b98b6D84Bc32ab9C3a56e8fAA94',
  BoostedRedemption: '0x0406435d7bff6630Fe18883a9c620e849Be5a446',
  ReverseBurnRedemption: '0x2C0CBaA4621aEB9e38FdF2ACf8BB1B1C45b12DF4',
  
  // DEX Infrastructure (PulseX)
  PULSEX_ROUTER: '0x0Ca49B2568bC418abF1d785e4E88f862fcCdE1a8',
  PULSEX_FACTORY: '0xF9f8A5Bd3c78b71A751444473C5533090A1a9529',
  WPLS: '0xD915dF7491150872AaEF54a88302C42e4dd2FCE9'
} as const;

// Export network configuration
export const NETWORK = {
  chainId: 943,
  name: 'PulseChain v4 Testnet',
  rpcUrl: 'https://rpc.v4.testnet.pulsechain.com',
  explorerUrl: 'https://scan.v4.testnet.pulsechain.com',
  nativeCurrency: {
    name: 'Pulse',
    symbol: 'PLS',
    decimals: 18
  }
} as const;

// Export token information
export const TOKENS = {
  STATE_V3: {
    address: '0x0f18C35D5828322127D4b9955c4d48F32413716f',
    name: 'pSTATE',
    symbol: 'pSTATE',
    decimals: 18,
    totalSupply: '100000000000000000000000000000000'
  },
  DAV_V3: {
    address: '0xd20fEeCFCf838f95e7163ffA430a09F14aC7A73A',
    name: 'pDAV',
    symbol: 'pDAV',
    decimals: 18,
    totalSupply: '2000000000000000000000'
  },
  WPLS: {
    address: '0xD915dF7491150872AaEF54a88302C42e4dd2FCE9',
    name: 'Wrapped PLS',
    symbol: 'WPLS',
    decimals: 18
  }
} as const;

// Export protocol constants
export const PROTOCOL_CONSTANTS = {
  PROTOCOL_FEE_BPS: 50,
  NORMAL_BURN_BPS: 3000,
  AUCTION_DAYS_LIMIT: 1000,
  CLAIM_INTERVAL: 8640000,
  MAX_SUPPLY: '500000000000000000000000000000000',
  VERSION: '4.0'
} as const;

// Export integration status
export const INTEGRATION_STATUS = {
  ready: true,
  swapConfigured: true,
  tokensLinked: true,
  contractsDeployed: true,
  lastVerified: '2025-01-02T00:00:00Z'
} as const;

// Utility functions
export const getContractAddress = (contractName: keyof typeof CONTRACTS): string => {
  return CONTRACTS[contractName];
};

export const getTokenInfo = (tokenName: keyof typeof TOKENS) => {
  return TOKENS[tokenName];
};

export const isValidChainId = (chainId: number): boolean => {
  return chainId === NETWORK.chainId;
};

// Default export
export default {
  CONTRACTS,
  NETWORK,
  TOKENS,
  PROTOCOL_CONSTANTS,
  INTEGRATION_STATUS,
  deploymentConfig,
  protocolConfig,
  contractAbis
};