// TypeScript definitions for State DEX Protocol V4
// Generated for PulseChain v4 Testnet deployment

export interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ContractInfo {
  address: `0x${string}`;
  deploymentBlock: number;
  description: string;
  configured?: boolean;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
}

export interface TokenInfo extends ContractInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

export interface ContractAddresses {
  core: {
    SWAP_V3: ContractInfo;
    STATE_V3: TokenInfo;
    DAV_V3: TokenInfo;
  };
  lens: {
    SwapLens: ContractInfo;
  };
  metrics: {
    AuctionMetrics: ContractInfo;
  };
  controllers: {
    BuyAndBurnController: ContractInfo;
  };
  distributors: {
    AirdropDistributor: ContractInfo;
    BoostedRedemption: ContractInfo;
    ReverseBurnRedemption: ContractInfo;
  };
  helpers: {
    LPHelper: ContractInfo;
  };
}

export interface DexConfig {
  router: {
    address: `0x${string}`;
    name: string;
  };
  factory: {
    address: `0x${string}`;
    name: string;
  };
  baseToken: TokenInfo;
}

export interface GovernanceConfig {
  owner: `0x${string}`;
  treasury: `0x${string}`;
}

export interface ProtocolConstants {
  PROTOCOL_FEE_BPS: number;
  NORMAL_BURN_BPS: number;
  AUCTION_DAYS_LIMIT: number;
  CLAIM_INTERVAL: number;
  MAX_SUPPLY: string;
}

export interface ProtocolConfig {
  version: string;
  status: 'FULLY_DEPLOYED_AND_INTEGRATED' | 'DEPLOYING' | 'FAILED';
  features: {
    auctions: boolean;
    swapping: boolean;
    staking: boolean;
    buyAndBurn: boolean;
    liquidityMining: boolean;
    airdrop: boolean;
  };
  constants: ProtocolConstants;
}

export interface FrontendConfig {
  supportedWallets: string[];
  requiredChainId: number;
  fallbackRpc: string;
  multicallAddress: `0x${string}` | null;
  subgraphUrl: string | null;
}

export interface IntegrationStatus {
  readyForUse: boolean;
  swapConfigured: boolean;
  tokensLinked: boolean;
  contractsDeployed: boolean;
  lastVerified: string;
}

export interface StateDexConfig {
  network: NetworkConfig;
  contracts: ContractAddresses;
  dex: DexConfig;
  governance: GovernanceConfig;
  protocol: ProtocolConfig;
  frontend: FrontendConfig;
  integration: IntegrationStatus;
}

// Auction-related types
export interface AuctionStatus {
  tokenOfDay: `0x${string}`;
  activeWindow: boolean;
  isReverse: boolean;
  appearanceCount: number;
  secondsLeft: number;
}

export interface ScheduleConfig {
  isSet: boolean;
  start: number;
  daysLimit: number;
  scheduledCount: number;
}

// Swap-related types
export interface SwapParams {
  inputToken: `0x${string}`;
  outputToken: `0x${string}`;
  amountIn: string;
  amountOutMin: string;
  deadline: number;
}

export interface UserSwapInfo {
  hasSwapped: boolean;
  hasReverseSwap: boolean;
  cycle: number;
}

// Token balance and allowance types
export interface TokenBalance {
  address: `0x${string}`;
  balance: string;
  decimals: number;
  symbol: string;
}

export interface TokenAllowance {
  owner: `0x${string}`;
  spender: `0x${string}`;
  allowance: string;
}

// Event types for contract interactions
export interface SwapEvent {
  user: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOut: string;
  blockNumber: number;
  transactionHash: `0x${string}`;
}

export interface AuctionFinalizedEvent {
  auctionId: number;
  tokenIn: `0x${string}`;
  amountIn: string;
  amountInPLS: string;
  finalizedBy: `0x${string}`;
  finalizedAt: number;
  blockNumber: number;
  transactionHash: `0x${string}`;
}

// Contract interaction helpers
export type ContractCall<T = any> = {
  address: `0x${string}`;
  functionName: string;
  args?: any[];
  abi: any[];
  chainId: number;
};

export type ContractWrite<T = any> = ContractCall<T> & {
  value?: bigint;
  gasLimit?: bigint;
};

// Contract addresses enum for type safety
export enum CoreContracts {
  SWAP_V3 = '0x8E9B834bF7962C2Dc650FCF0BC1c2C51b99Fa7a1',
  STATE_V3 = '0x0f18C35D5828322127D4b9955c4d48F32413716f',
  DAV_V3 = '0xd20fEeCFCf838f95e7163ffA430a09F14aC7A73A',
}

export enum HelperContracts {
  SWAP_LENS = '0x324D5165a69de99537Cde406a1c1766bFe0e3D37',
  AUCTION_METRICS = '0xCC95D2126f1Fc3e57B4AB19d6D306c31D237B881',
  BUY_AND_BURN = '0x2E1cafbbE927E870c2857905887Cb65826f53379',
  LP_HELPER = '0x6BD4B08F4563cB2AD1637E24eD6959a6c0c7a5b5',
}

export enum DexContracts {
  PULSEX_ROUTER = '0x0Ca49B2568bC418abF1d785e4E88f862fcCdE1a8',
  PULSEX_FACTORY = '0xF9f8A5Bd3c78b71A751444473C5533090A1a9529',
  WPLS = '0xD915dF7491150872AaEF54a88302C42e4dd2FCE9',
}

// Utility types
export type Address = `0x${string}`;
export type BigNumberish = string | number | bigint;
export type TransactionHash = `0x${string}`;

// Error types
export interface ContractError {
  name: string;
  message: string;
  code?: string;
  data?: any;
}

export interface NetworkError {
  code: number;
  message: string;
  details?: string;
}

// Hook return types (for React integration)
export interface UseContractReadResult<T = any> {
  data: T | undefined;
  error: ContractError | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

export interface UseContractWriteResult {
  write: (args?: any[]) => Promise<TransactionHash>;
  writeAsync: (args?: any[]) => Promise<TransactionHash>;
  error: ContractError | null;
  loading: boolean;
  success: boolean;
}

export interface UseTokenBalanceResult {
  balance: string;
  decimals: number;
  symbol: string;
  formatted: string;
  error: ContractError | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

// Frontend state management types
export interface WalletState {
  address: Address | null;
  chainId: number | null;
  connected: boolean;
  connecting: boolean;
}

export interface ProtocolState {
  auctionStatus: AuctionStatus | null;
  scheduleConfig: ScheduleConfig | null;
  userSwapInfo: Record<string, UserSwapInfo>;
  tokenBalances: Record<string, TokenBalance>;
  loading: boolean;
  error: NetworkError | null;
}

// Constants
export const CHAIN_ID = 943 as const;
export const NETWORK_NAME = 'PulseChain v4 Testnet' as const;
export const RPC_URL = 'https://rpc.v4.testnet.pulsechain.com' as const;
export const EXPLORER_URL = 'https://scan.v4.testnet.pulsechain.com' as const;

// Type guards
export function isAddress(address: string): address is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isTransactionHash(hash: string): hash is TransactionHash {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

// Default export for main config type
export default StateDexConfig;