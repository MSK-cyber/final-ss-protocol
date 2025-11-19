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
    DAV_TOKEN: "0x01544bb54b4DEC0dAdbD8876C4C6C49952Ec3DaE",
    STATE_TOKEN: "0xD3a2771DfEEC9555D1946CBcaA8552efE221d0e8",
    AUCTION: "0x27Bba59282CF6a5ABBef336A8cbD9ff068C4F8C1",
    LP_HELPER: "", // Deprecated - use SWAP_V3.createPoolOneClick()
    BUY_BURN_CONTROLLER: "0x48626c6c0Db922fb093dcccB3a867BAA78B8EF47",
    AUCTION_METRICS: "", // Not deployed in this sequence
    SWAP_LENS: "0x75001A4FE1Be73e4B1CD6d952768DE3c71dD1013",
    AIRDROP_DISTRIBUTOR: "0x619676128d81eD8b522115234ade2912F21594d9",
    AUCTION_ADMIN: "0xC8E1EC71Af0Fdab28A451D3549E2d64394035b9C"
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