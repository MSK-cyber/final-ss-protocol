let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0x329390c539008885491a09Df6798267e643182A1' },
      STATE_V3: { address: '0x72f55666a5CfB5a7C179F9E829402C34bd0708Bd' },
      DAV_V3: { address: '0xb8bC708aF8dc74DeFAff6A45708f37E046B1498d' },
    },
    support: { 
      SwapLens: { address: '0x458D1e955374f3a45278B38ac7ae75bCFfc1c444' },
      AuctionMetrics: { address: '' },
  BuyAndBurnController: { address: '0xF6Cd74d4DEdB69bE6824F51d669D5F3483962335' }
    },
    stages: {
      AirdropDistributor: { address: '0x0d0F194f1d2652185F42148b584F8381a5c3545F' },
      AuctionAdmin: { address: '0x3F3350E7Cc9F1309182E3280eF9aBB4d042d6aB4' }
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
