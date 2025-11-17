let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0x0aa148D71361CAE3689bfe7897ef18979b3689C5' },
      STATE_V3: { address: '0x8a1e26C63017cE03e7618e6DEDFA58CA2317AA1a' },
      DAV_V3: { address: '0x03843b39d27dA897fD3896f8E2BDF0f2f1b6CBcd' },
    },
    support: { 
      SwapLens: { address: '0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0' },
      AuctionMetrics: { address: '0xa309168C3Ea046305cCf453B1b8470319DF70780' },
      BuyAndBurnController: { address: '0x50167F148fC386c6e3bEbEaD7B0A7A5D0bd74438' }
    },
    stages: {
      AirdropDistributor: { address: '0x767048b336F3d90C385Ede970c9894b6d11436Ac' },
      AuctionAdmin: { address: '0xD27f73077C87eD5485269aACF324cC6f587d9E3b' }
    },
    utilities: { LPHelper: { address: '0xea5412ECcD8b4b7Ad27EE366dA84F3464Ac3D347' } },
  },
  dex: {
    router: { address: '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02' },
    factory: { address: '0x1715a3E4A142d8b698131108995174F37aEBA10D' },
    baseToken: { address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', symbol: 'WPLS', decimals: 18 },
  },
};

export async function loadRuntimeConfig() {
  if (runtimeConfig) return runtimeConfig;
  if (!loadPromise) {
    loadPromise = fetch('/deployments/config.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : DEFAULTS))
      .catch(() => DEFAULTS)
      .then((json) => {
        runtimeConfig = json || DEFAULTS;
        return runtimeConfig;
      });
  }
  return loadPromise;
}

export function getRuntimeConfigSync() {
  return runtimeConfig || DEFAULTS;
}

export function getAddress(path, fallback) {
  const cfg = getRuntimeConfigSync();
  try {
    const parts = path.split('.');
    let cur = cfg;
    for (const p of parts) cur = cur?.[p];
    const addr = cur?.address || cur;
    return addr || fallback;
  } catch {
    return fallback;
  }
}
