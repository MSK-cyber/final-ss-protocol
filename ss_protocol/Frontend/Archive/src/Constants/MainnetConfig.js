// State DEX V4 Mainnet Configuration
// Deployed on PulseChain Mainnet (Chain ID: 369)
// Deployment Date: October 16, 2025

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
    DAV_TOKEN: "0x03843b39d27dA897fD3896f8E2BDF0f2f1b6CBcd",
    STATE_TOKEN: "0x8a1e26C63017cE03e7618e6DEDFA58CA2317AA1a",
    AUCTION: "0x0aa148D71361CAE3689bfe7897ef18979b3689C5",
    LP_HELPER: "0xea5412ECcD8b4b7Ad27EE366dA84F3464Ac3D347",
    BUY_BURN_CONTROLLER: "0x50167F148fC386c6e3bEbEaD7B0A7A5D0bd74438",
    AUCTION_METRICS: "0xa309168C3Ea046305cCf453B1b8470319DF70780",
    SWAP_LENS: "0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0",
    AIRDROP_DISTRIBUTOR: "0x767048b336F3d90C385Ede970c9894b6d11436Ac",
    AUCTION_ADMIN: "0xD27f73077C87eD5485269aACF324cC6f587d9E3b"
  },
  dex: {
    ROUTER: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
    FACTORY: "0x1715a3E4A142d8b698131108995174F37aEBA10D",
    WPLS: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
  },
  deployment: {
    deploymentBlocks: "24776602-24776705",
    gasUsed: "~21M",
    totalCost: "~68,000 PLS",
    deployedAt: "2025-10-16T00:00:00Z"
  }
};

export default MAINNET_CONFIG;