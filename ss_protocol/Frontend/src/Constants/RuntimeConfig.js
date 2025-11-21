let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0xad63be034EB210e8870Ddb22541856f96302C344' },
      STATE_V3: { address: '0xd290bC9cFaEdf2A90174f669BF9Aad7E71180451' },
      DAV_V3: { address: '0xE843FE90dF63659d1957237ee8E91232Eedd36B3' },
    },
    support: { 
      SwapLens: { address: '0xAF2190CC157b184A371016Ca0EA471D6bFdbF541' },
      AuctionMetrics: { address: '' },
  BuyAndBurnController: { address: '0xe90444017e9349Dd62abC09FE26e6907E6350C56' }
    },
    stages: {
      AirdropDistributor: { address: '0x5346B394b5b36D6d9f1fE4785D56C0D4644085d3' },
      AuctionAdmin: { address: '0x5094FA04929684b6904bb9184f813D686906533a' }
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
