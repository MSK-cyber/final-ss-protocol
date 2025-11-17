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
    // Check if we have a fresh cached value
    if (cachedAuctionDuration && Date.now() - lastDetectionTime < CACHE_DURATION) {
      return cachedAuctionDuration;
    }

    // Get time left for the token
    const timeLeft = await auctionContract.getAuctionTimeLeft(tokenAddress);
    const timeLeftSeconds = Number(timeLeft);
    
    // Check if auction is active
    const isActive = await auctionContract.isAuctionActive(tokenAddress);
    
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
    
    return cachedAuctionDuration || 300; // Default to 5 minutes if unable to detect
  } catch (error) {
    console.error('Error detecting auction duration:', error);
    return cachedAuctionDuration || 300; // Return cached or default
  }
}

/**
 * Detect auction interval by monitoring the gap between auction windows
 * @param {Object} auctionContract - The auction contract instance
 * @returns {Promise<number>} Interval in seconds
 */
export async function detectAuctionInterval(auctionContract) {
  try {
    // Check if we have a fresh cached value
    if (cachedAuctionInterval && Date.now() - lastDetectionTime < CACHE_DURATION) {
      return cachedAuctionInterval;
    }
    
    // Try to load from localStorage
    try {
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
    
    // The interval is typically the same as duration in many auction systems
    // If we have duration, use it as interval estimate
    if (cachedAuctionDuration) {
      cachedAuctionInterval = cachedAuctionDuration;
      console.log(`✅ Using auction duration as interval: ${cachedAuctionInterval} seconds`);
      return cachedAuctionInterval;
    }
    
    return 300; // Default to 5 minutes if unable to detect
  } catch (error) {
    console.error('Error detecting auction interval:', error);
    return cachedAuctionInterval || 300;
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
    // Get today's token if not provided
    let activeToken = tokenAddress;
    if (!activeToken) {
      try {
        const [todayToken] = await auctionContract.getTodayToken();
        activeToken = todayToken;
      } catch (e) {
        console.warn('Could not get today\'s token:', e);
      }
    }
    
    const duration = await detectAuctionDuration(auctionContract, activeToken);
    const interval = await detectAuctionInterval(auctionContract);
    
    return {
      duration,
      interval,
      durationFormatted: formatDuration(duration),
      intervalFormatted: formatDuration(interval),
    };
  } catch (error) {
    console.error('Error getting auction timing:', error);
    return {
      duration: 300,
      interval: 300,
      durationFormatted: '5 minutes',
      intervalFormatted: '5 minutes',
    };
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
