// State DEX V4 Mainnet Configuration
// Deployed on PulseChain Mainnet (Chain ID: 369)
// Deployment Date: November 21, 2025

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
    DAV_TOKEN: "0xCC6EE62e3CBE05d622af0F08Bac76067e914C433",
    STATE_TOKEN: "0x4e90670b4cDE8FF7cdDEeAf99AEFD68a114d9C01",
    AUCTION: "0x8172716bD7117461D4b20bD0434358F74244d4ec",
    LP_HELPER: "", // Deprecated - use SWAP_V3.createPoolOneClick()
    BUY_BURN_CONTROLLER: "0xf1Df5CD347A498768A44F7e0549F833525e3b751",
    AUCTION_METRICS: "", // Not deployed in this sequence
    SWAP_LENS: "0x9683fC01A08Db24133B60cE51B4BEB616508a97E",
    AIRDROP_DISTRIBUTOR: "0x40FD2DA5B8ECA575Ca10C06F9DC5aFD205D32630",
    AUCTION_ADMIN: "0xEab50ADaB223f96f139B75430dF7274aE66560Db"
  },
  dex: {
    ROUTER: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
    FACTORY: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
  },
  deployment: {
    deploymentBlocks: "25190779-25190855",
    gasUsed: "~16M",
    totalCost: "~1850 PLS",
    deployedAt: "2025-12-05T12:00:00Z"
  }
};

export default MAINNET_CONFIG;