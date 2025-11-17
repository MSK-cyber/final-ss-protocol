// State DEX V4 Mainnet Configuration
// Deployed on PulseChain Mainnet (Chain ID: 369)
// Deployment Date: November 13, 2025

export const MAINNET_CONFIG = {
  network: {
    chainId: 369,
    name: "PulseChain Mainnet",
    rpcUrl: "https://rpc.pulsechain.com",
    explorerUrl: "https://scan.pulsechain.com",
    nativeCurrency: {
      name: "Pulse",
      symbol: "PLS", 
      decimals: 18
    }
  },
  contracts: {
    DAV_TOKEN: "0xb8bC708aF8dc74DeFAff6A45708f37E046B1498d",
    STATE_TOKEN: "0x72f55666a5CfB5a7C179F9E829402C34bd0708Bd",
    AUCTION: "0x329390c539008885491a09Df6798267e643182A1",
    LP_HELPER: "", // Deprecated - use SWAP_V3.createPoolOneClick()
    BUY_BURN_CONTROLLER: "0xF6Cd74d4DEdB69bE6824F51d669D5F3483962335",
    AUCTION_METRICS: "", // Not deployed in this sequence
    SWAP_LENS: "0x458D1e955374f3a45278B38ac7ae75bCFfc1c444",
    AIRDROP_DISTRIBUTOR: "0x0d0F194f1d2652185F42148b584F8381a5c3545F",
    AUCTION_ADMIN: "0x3F3350E7Cc9F1309182E3280eF9aBB4d042d6aB4"
  },
  dex: {
    ROUTER: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
    FACTORY: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
  },
  deployment: {
    deploymentBlocks: "25009018-25009030",
    gasUsed: "~8.3M",
    totalCost: "~1184 PLS",
    deployedAt: "2025-11-13T06:46:00Z"
  }
};

export default MAINNET_CONFIG;