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
    DAV_TOKEN: "0xE843FE90dF63659d1957237ee8E91232Eedd36B3",
    STATE_TOKEN: "0xd290bC9cFaEdf2A90174f669BF9Aad7E71180451",
    AUCTION: "0xad63be034EB210e8870Ddb22541856f96302C344",
    LP_HELPER: "", // Deprecated - use SWAP_V3.createPoolOneClick()
    BUY_BURN_CONTROLLER: "0xe90444017e9349Dd62abC09FE26e6907E6350C56",
    AUCTION_METRICS: "", // Not deployed in this sequence
    SWAP_LENS: "0xAF2190CC157b184A371016Ca0EA471D6bFdbF541",
    AIRDROP_DISTRIBUTOR: "0x5346B394b5b36D6d9f1fE4785D56C0D4644085d3",
    AUCTION_ADMIN: "0x5094FA04929684b6904bb9184f813D686906533a"
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