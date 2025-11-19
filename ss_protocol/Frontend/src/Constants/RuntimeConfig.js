let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0x27Bba59282CF6a5ABBef336A8cbD9ff068C4F8C1' },
      STATE_V3: { address: '0xD3a2771DfEEC9555D1946CBcaA8552efE221d0e8' },
      DAV_V3: { address: '0x01544bb54b4DEC0dAdbD8876C4C6C49952Ec3DaE' },
    },
    support: { 
      SwapLens: { address: '0x75001A4FE1Be73e4B1CD6d952768DE3c71dD1013' },
      AuctionMetrics: { address: '' },
  BuyAndBurnController: { address: '0x48626c6c0Db922fb093dcccB3a867BAA78B8EF47' }
    },
    stages: {
      AirdropDistributor: { address: '0x619676128d81eD8b522115234ade2912F21594d9' },
      AuctionAdmin: { address: '0xC8E1EC71Af0Fdab28A451D3549E2d64394035b9C' }
    },
    utilities: { LPHelper: { address: '' } },
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
