let runtimeConfig = null;
let loadPromise = null;

const DEFAULTS = {
  network: { chainId: 369, explorerUrl: 'https://scan.pulsechain.com' },
  contracts: {
    core: {
      SWAP_V3: { address: '0xeA55dB9Ae0eAfD245720563583871CE9ED549772' },
      STATE_V3: { address: '0x9454Eb295d8E4d871d724013dffd2301C486FD07' },
      DAV_V3: { address: '0x42107c7441f0A3E1CB3Dba948597c39615765227' },
    },
    support: { 
      SwapLens: { address: '0x04566b9F4852d8b0D3911aB1f2C7d0C0955f6Af0' },
      AuctionMetrics: { address: '0xa309168C3Ea046305cCf453B1b8470319DF70780' },
      BuyAndBurnController: { address: '0x1bEAfD2cdffCD2867914B3fD6cfe92883ad3A687' }
    },
    stages: {
      AirdropDistributor: { address: '0x2C7725F02235BA3387369560A7Ea16a61778D6ff' },
      AuctionAdmin: { address: '0x9a64Db2Eb8e6b01a517B1C96F325fa5103a589Ad' }
    },
    utilities: { LPHelper: { address: '0x967c15FcB0ED957ab8d406721E12C95BD859c898' } },
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
