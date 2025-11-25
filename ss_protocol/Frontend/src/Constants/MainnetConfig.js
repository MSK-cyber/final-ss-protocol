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
    DAV_TOKEN: "0xf01D3b66458Ef4a419679480ba59ADf646E4c838",
    STATE_TOKEN: "0x834A4eE2849E25b94A4aB6bC19D3CD0542256244",
    AUCTION: "0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A",
    LP_HELPER: "", // Deprecated - use SWAP_V3.createPoolOneClick()
    BUY_BURN_CONTROLLER: "0x1ACC1dc6E734A0fb7ca8Ab128F3D34f20092bC11",
    AUCTION_METRICS: "", // Not deployed in this sequence
    SWAP_LENS: "0x82c3491e629Da99b785FFBb86cec02a77E5732Fb",
    AIRDROP_DISTRIBUTOR: "0x99F563cb688834134668858837dF97d50346F906",
    AUCTION_ADMIN: "0xA001442C5147BBCbA73CafA86Ef90225086cF7e1"
  },
  dex: {
    ROUTER: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
    FACTORY: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
  },
  deployment: {
    deploymentBlocks: "25079125-25079284",
    gasUsed: "~15.3M",
    totalCost: "~5577 PLS",
    deployedAt: "2025-11-21T16:00:00Z"
  }
};

export default MAINNET_CONFIG;