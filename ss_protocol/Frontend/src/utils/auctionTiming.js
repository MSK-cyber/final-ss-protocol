import { ethers } from "ethers";
/**
 * Auction Timing Detection Utility
 * 
 * Dynamically detects AUCTION_DURATION and AUCTION_INTERVAL from on-chain data
 * instead of using hardcoded values. This allows the frontend to automatically
 * adapt when smart contract timing parameters change.
 */

// Cache for detected timing values
let cachedAuctionDuration = null;
let cachedAuctionInterval = null;
let lastDetectionTime = 0;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache

/**
 * Detect auction duration by monitoring when an auction starts with full time
 * @param {Object} auctionContract - The auction contract instance
 * @param {string} tokenAddress - The token address to check
 * @returns {Promise<number>} Duration in seconds
 */
export async function detectAuctionDuration(auctionContract, tokenAddress) {
  try {
    if (!auctionContract || typeof auctionContract.getAuctionTimeLeft !== 'function' || typeof auctionContract.isAuctionActive !== 'function') {
  console.warn('auctionTiming.detectAuctionDuration: auctionContract not ready');
  // Prefer sane defaults that match on-chain library if unknown
  return cachedAuctionDuration || 1800; // 30 minutes
    }
    // Check if we have a fresh cached value
    if (cachedAuctionDuration && Date.now() - lastDetectionTime < CACHE_DURATION) {
      return cachedAuctionDuration;
    }

    // Get time left for the token
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      // Try to resolve today's token if none provided
      try {
        const t = await auctionContract.getTodayToken();
        tokenAddress = (typeof t === 'string') ? t : (t?.[0] || t?.tokenOfDay || null);
      } catch {}
    }

    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
  return cachedAuctionDuration || 1800;
    }

    let timeLeftSeconds = 0;
    try {
      const timeLeft = await auctionContract.getAuctionTimeLeft(tokenAddress);
      timeLeftSeconds = Number(timeLeft);
    } catch (e) {
      console.warn('detectAuctionDuration: getAuctionTimeLeft failed; using defaults', e?.message || e);
      return cachedAuctionDuration || 1800;
    }
    
    // Check if auction is active (guard decode errors)
    let isActive = false;
    try {
      isActive = await auctionContract.isAuctionActive(tokenAddress);
    } catch (e) {
      console.warn('detectAuctionDuration: isAuctionActive failed; using passive path', e?.message || e);
      isActive = false;
    }
    
    if (isActive && timeLeftSeconds > 0) {
      // If auction just started (time left is close to full duration), we can detect it
      // We consider it "just started" if time left is within 95-100% of expected duration
      // Since we don't know the exact duration yet, we'll store observed values
      
      // Store the maximum observed time left as the likely duration
      if (!cachedAuctionDuration || timeLeftSeconds > cachedAuctionDuration * 0.95) {
        cachedAuctionDuration = timeLeftSeconds;
        lastDetectionTime = Date.now();
        console.log(`✅ Detected auction duration: ${timeLeftSeconds} seconds (${Math.floor(timeLeftSeconds / 60)} minutes)`);
        
        // Persist to localStorage for cross-session caching
        try {
          localStorage.setItem('detected_auction_duration', timeLeftSeconds.toString());
          localStorage.setItem('auction_duration_timestamp', Date.now().toString());
        } catch (e) {
          console.warn('Could not save auction duration to localStorage:', e);
        }
      }
    }
    
    // Try to load from localStorage if not detected yet
    if (!cachedAuctionDuration) {
      try {
        const stored = localStorage.getItem('detected_auction_duration');
        const timestamp = localStorage.getItem('auction_duration_timestamp');
        
        if (stored && timestamp) {
          const age = Date.now() - parseInt(timestamp);
          if (age < CACHE_DURATION) {
            cachedAuctionDuration = parseInt(stored);
            console.log(`📦 Loaded auction duration from cache: ${cachedAuctionDuration} seconds`);
          }
        }
      } catch (e) {
        console.warn('Could not load auction duration from localStorage:', e);
      }
    }
    
    // Fallback: estimate based on current time left (assume we're mid-auction)
    if (!cachedAuctionDuration && timeLeftSeconds > 0) {
      // Common durations: 5min, 15min, 30min, 1hr
      const commonDurations = [300, 900, 1800, 3600];
      const closest = commonDurations.reduce((prev, curr) => 
        Math.abs(curr - timeLeftSeconds) < Math.abs(prev - timeLeftSeconds) ? curr : prev
      );
      cachedAuctionDuration = closest;
      console.log(`⚠️ Estimated auction duration: ${closest} seconds based on time left`);
    }
    
    return cachedAuctionDuration || 1800; // Default to 30 minutes if unable to detect
  } catch (error) {
    console.warn('Error detecting auction duration:', error?.message || error);
    return cachedAuctionDuration || 1800; // Return cached or default
  }
}

/**
 * Detect auction interval by monitoring the gap between auction windows
 * @param {Object} auctionContract - The auction contract instance
 * @returns {Promise<number>} Interval in seconds
 */
export async function detectAuctionInterval(auctionContract) {
  try {
    if (!auctionContract) {
      return cachedAuctionInterval || 3600; // 1 hour
    }
    // Check if we have a fresh cached value
    if (cachedAuctionInterval && Date.now() - lastDetectionTime < CACHE_DURATION) {
      return cachedAuctionInterval;
    }
    
    // Try to load from localStorage
    try {
      const override = localStorage.getItem('auction_interval_override');
      if (override) {
        cachedAuctionInterval = parseInt(override);
        console.log(`🧩 Using auction interval override: ${cachedAuctionInterval} seconds`);
        return cachedAuctionInterval;
      }
      const stored = localStorage.getItem('detected_auction_interval');
      const timestamp = localStorage.getItem('auction_interval_timestamp');
      
      if (stored && timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age < CACHE_DURATION) {
          cachedAuctionInterval = parseInt(stored);
          console.log(`📦 Loaded auction interval from cache: ${cachedAuctionInterval} seconds`);
          return cachedAuctionInterval;
        }
      }
    } catch (e) {
      console.warn('Could not load auction interval from localStorage:', e);
    }
    
    // Fallback to 0 interval (continuous) when unknown
    return 0;
  } catch (error) {
    console.warn('Error detecting auction interval:', error?.message || error);
    return cachedAuctionInterval || 0;
  }
}

/**
 * Get formatted duration string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted string like "5 minutes" or "1 hour"
 */
export function formatDuration(seconds) {
  if (!seconds) return 'unknown';
  
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const remainingMinutes = Math.floor((seconds % 3600) / 60);
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }
}

/**
 * Get auction timing info
 * @param {Object} auctionContract - The auction contract instance
 * @param {string} tokenAddress - Optional token address to check
 * @returns {Promise<Object>} Object with duration and interval in seconds and formatted
 */
export async function getAuctionTiming(auctionContract, tokenAddress = null) {
  try {
    if (!auctionContract) {
      return {
        duration: 1800,
        interval: 0,
        durationFormatted: '30 minutes',
        intervalFormatted: '0 seconds',
      };
    }
    // Fast-path: if contract exposes getSlotInfo(), use it directly
    try {
      const fn = typeof auctionContract.getSlotInfo === 'function'
        ? auctionContract.getSlotInfo
        : (auctionContract.getFunction ? auctionContract.getFunction('getSlotInfo()') : null);
      if (fn) {
        const info = await fn();
        // Supports both array and named-struct return
        const auctionDuration = Number(info?.auctionDuration ?? info?.[2] ?? 7200);
        const interval = Number(info?.interval ?? info?.[3] ?? 3600);
        // Cache for 1h
        cachedAuctionDuration = auctionDuration;
        cachedAuctionInterval = interval;
        lastDetectionTime = Date.now();
        return {
          duration: auctionDuration,
          interval,
          durationFormatted: formatDuration(auctionDuration),
          intervalFormatted: formatDuration(interval),
        };
      }
    } catch (e) {
      // Ignore if not available on deployed contract
      // console.debug('getSlotInfo not available:', e?.message || e);
    }
    // Get today's token if not provided
    let activeToken = tokenAddress;
    if (!activeToken) {
      try {
        const todayToken = await auctionContract.getTodayToken();
        activeToken = (typeof todayToken === 'string') ? todayToken : (todayToken?.[0] || todayToken?.tokenOfDay || null);
      } catch (e) {
        console.warn('Could not get today\'s token:', e);
      }
    }
    
    // Allow overrides via localStorage for rapid testing/tuning
    let durationOverride = 0;
    let intervalOverride = 0;
    try {
      durationOverride = parseInt(localStorage.getItem('auction_duration_override') || '0');
      intervalOverride = parseInt(localStorage.getItem('auction_interval_override') || '0');
    } catch {}

    const duration = durationOverride > 0
      ? durationOverride
      : await detectAuctionDuration(auctionContract, activeToken);
    const interval = intervalOverride > 0
      ? intervalOverride
      : await detectAuctionInterval(auctionContract);
    
    return {
      duration,
      interval,
      durationFormatted: formatDuration(duration),
      intervalFormatted: formatDuration(interval),
    };
  } catch (error) {
    console.warn('Error getting auction timing:', error?.message || error);
    return {
      duration: 1800,
      interval: 0,
      durationFormatted: '30 minutes',
      intervalFormatted: '0 seconds',
    };
  }
}

/**
 * Optional helper to compute phase info from getSlotInfo() result.
 * Returns { phase: 'active'|'interval', secondsLeft, phaseEndAt } or null if insufficient data.
 */
export function computePhaseFromSlotInfo(slotInfo, nowSec) {
  try {
    if (!slotInfo) return null;
    const active = Boolean(slotInfo?.active ?? slotInfo?.[4]);
    const auctionDuration = Number(slotInfo?.auctionDuration ?? slotInfo?.[2] ?? 0);
    const interval = Number(slotInfo?.interval ?? slotInfo?.[3] ?? 0);
    const currentSlotStart = Number(slotInfo?.currentSlotStart ?? slotInfo?.[5] ?? 0);
    const currentSlotEnd = Number(slotInfo?.currentSlotEnd ?? slotInfo?.[6] ?? 0);
    const timeToNextStart = Number(slotInfo?.timeToNextStart ?? slotInfo?.[7] ?? 0);
    if (!nowSec) nowSec = Math.floor(Date.now() / 1000);
    if (active && currentSlotEnd > nowSec) {
      return { phase: 'active', secondsLeft: currentSlotEnd - nowSec, phaseEndAt: currentSlotEnd, auctionDuration, interval };
    }
    if (!active && timeToNextStart > 0) {
      const nextStart = nowSec + timeToNextStart;
      return { phase: 'interval', secondsLeft: timeToNextStart, phaseEndAt: nextStart, auctionDuration, interval };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clear cached timing values (useful after contract upgrades)
 */
export function clearTimingCache() {
  cachedAuctionDuration = null;
  cachedAuctionInterval = null;
  lastDetectionTime = 0;
  
  try {
    localStorage.removeItem('detected_auction_duration');
    localStorage.removeItem('auction_duration_timestamp');
    localStorage.removeItem('detected_auction_interval');
    localStorage.removeItem('auction_interval_timestamp');
    console.log('🗑️ Cleared auction timing cache');
  } catch (e) {
    console.warn('Could not clear timing cache from localStorage:', e);
  }
}

/**
 * Force update timing detection on next call
 */
export function invalidateTimingCache() {
  lastDetectionTime = 0;
  console.log('⚠️ Invalidated auction timing cache - will refresh on next call');
}

// ===== Manual schedule support =====
// Anchor: 2025-11-22 08:00 GMT+2 = 2025-11-22 06:00:00 UTC
let MANUAL_ANCHOR_UTC = 0;
try {
  const ts = Date.parse('2025-11-22T06:00:00Z');
  if (!Number.isNaN(ts)) MANUAL_ANCHOR_UTC = Math.floor(ts / 1000);
} catch {}
if (!MANUAL_ANCHOR_UTC) {
  // Fallback hardcoded epoch if Date parsing unavailable (Nov 22, 2025 06:00:00 UTC)
  // This is 1732254000 if computed; keep zero if unknown to force recompute by caller
  MANUAL_ANCHOR_UTC = 1732254000;
}

/**
 * Compute manual auction phase from a fixed anchor (08:00 GMT+2 on Nov 22, 2025 = 06:00 UTC).
 * - duration: 30min (1800)
 * - interval: 0 (continuous auctions)
 * - slot = 15min (duration + interval)
 * Returns { phase: 'active'|'interval', secondsLeft, phaseEndAt }
 */
export function computeManualPhase(nowSec, options = {}) {
  const duration = Number(options.duration ?? 1800);
  const interval = Number(options.interval ?? 0);
  const slot = duration + interval;
  const anchor = Number(options.anchorUtc ?? MANUAL_ANCHOR_UTC);
  if (!nowSec || !anchor || slot <= 0 || duration <= 0) {
    return { phase: null, secondsLeft: 0, phaseEndAt: 0 };
  }
  const delta = nowSec - anchor;
  // Before the very first start: show interval until the anchor, not an active phase
  if (delta < 0) {
    return {
      phase: 'interval',
      secondsLeft: Math.max(0, -delta),
      phaseEndAt: anchor,
    };
  }
  const since = delta; // non-negative here
  const slotIndex = Math.floor(since / slot);
  const currentSlotStart = anchor + slotIndex * slot;
  const currentSlotEnd = currentSlotStart + duration;
  if (nowSec < currentSlotEnd) {
    // Active window
    return {
      phase: 'active',
      secondsLeft: currentSlotEnd - nowSec,
      phaseEndAt: currentSlotEnd,
    };
  }
  // Interval window
  const nextStart = currentSlotStart + slot;
  return {
    phase: 'interval',
    secondsLeft: Math.max(0, nextStart - nowSec),
    phaseEndAt: nextStart,
  };
}
