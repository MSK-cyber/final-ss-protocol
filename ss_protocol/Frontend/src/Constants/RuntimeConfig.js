let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0x8172716bD7117461D4b20bD0434358F74244d4ec' },
      STATE_V3: { address: '0x4e90670b4cDE8FF7cdDEeAf99AEFD68a114d9C01' },
      DAV_V3: { address: '0xCC6EE62e3CBE05d622af0F08Bac76067e914C433' },
    },
    support: { 
      SwapLens: { address: '0x9683fC01A08Db24133B60cE51B4BEB616508a97E' },
      AuctionMetrics: { address: '' },
  BuyAndBurnController: { address: '0xf1Df5CD347A498768A44F7e0549F833525e3b751' }
    },
    stages: {
      AirdropDistributor: { address: '0x40FD2DA5B8ECA575Ca10C06F9DC5aFD205D32630' },
      AuctionAdmin: { address: '0xEab50ADaB223f96f139B75430dF7274aE66560Db' }
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
