// State DEX V4 Mainnet Configuration
// Deployed on PulseChain Mainnet (Chain ID: 369)
// Deployment Date: October 10, 2025

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
    DAV_TOKEN: "0x42107c7441f0A3E1CB3Dba948597c39615765227",
    STATE_TOKEN: "0x9454Eb295d8E4d871d724013dffd2301C486FD07",
    AUCTION: "0xeA55dB9Ae0eAfD245720563583871CE9ED549772",
    LP_HELPER: "0x967c15FcB0ED957ab8d406721E12C95BD859c898",
    BUY_BURN_CONTROLLER: "0x1bEAfD2cdffCD2867914B3fD6cfe92883ad3A687",
    AUCTION_METRICS: "0xa309168C3Ea046305cCf453B1b8470319DF70780",
    SWAP_LENS: "0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0",
    AIRDROP_DISTRIBUTOR: "0x2C7725F02235BA3387369560A7Ea16a61778D6ff",
    AUCTION_ADMIN: "0x9a64Db2Eb8e6b01a517B1C96F325fa5103a589Ad"
  },
  dex: {
    ROUTER: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
    FACTORY: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
  },
  deployment: {
    deploymentBlocks: "24676792-24676796",
    gasUsed: "19,393,232",
    totalCost: "7,030 PLS",
    deployedAt: "2025-10-04T00:00:00Z"
  }
};

export default MAINNET_CONFIG;