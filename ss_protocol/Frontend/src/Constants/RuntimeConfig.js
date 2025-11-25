let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A' },
      STATE_V3: { address: '0x834A4eE2849E25b94A4aB6bC19D3CD0542256244' },
      DAV_V3: { address: '0xf01D3b66458Ef4a419679480ba59ADf646E4c838' },
    },
    support: { 
      SwapLens: { address: '0x82c3491e629Da99b785FFBb86cec02a77E5732Fb' },
      AuctionMetrics: { address: '' },
  BuyAndBurnController: { address: '0x1ACC1dc6E734A0fb7ca8Ab128F3D34f20092bC11' }
    },
    stages: {
      AirdropDistributor: { address: '0x99F563cb688834134668858837dF97d50346F906' },
      AuctionAdmin: { address: '0xA001442C5147BBCbA73CafA86Ef90225086cF7e1' }
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
