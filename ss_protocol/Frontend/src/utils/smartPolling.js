/**
 * Smart Polling Utility
 * 
 * Industry best practices for Web3 data fetching:
 * - Fast polling when user is active (10-15s)
 * - Slow polling when user is idle (60s)
 * - Pause polling when tab is hidden
 * - Resume immediately when tab becomes visible
 * - Activity detection via mouse/keyboard/touch events
 */

// Global visibility state
let isTabVisible = typeof document !== 'undefined' ? !document.hidden : true;
let isUserActive = true;
let lastActivityTime = Date.now();

// Configuration
const IDLE_TIMEOUT = 30000; // Consider user idle after 30 seconds of no activity
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

// Track all active pollers for global pause/resume
const activePollers = new Set();

// Initialize visibility and activity listeners (only once)
let initialized = false;

function initializeListeners() {
  if (initialized || typeof document === 'undefined') return;
  initialized = true;

  // Visibility change listener
  document.addEventListener('visibilitychange', () => {
    isTabVisible = !document.hidden;
    
    if (isTabVisible) {
      // Tab became visible - resume all pollers immediately
      activePollers.forEach(poller => poller.onVisible());
    } else {
      // Tab hidden - pause all pollers
      activePollers.forEach(poller => poller.onHidden());
    }
  });

  // Activity detection
  const handleActivity = () => {
    lastActivityTime = Date.now();
    const wasIdle = !isUserActive;
    isUserActive = true;
    
    if (wasIdle) {
      // User became active - speed up polling
      activePollers.forEach(poller => poller.onActive());
    }
  };

  ACTIVITY_EVENTS.forEach(event => {
    document.addEventListener(event, handleActivity, { passive: true });
  });

  // Check for idle state periodically
  setInterval(() => {
    if (Date.now() - lastActivityTime > IDLE_TIMEOUT) {
      if (isUserActive) {
        isUserActive = false;
        // User became idle - slow down polling
        activePollers.forEach(poller => poller.onIdle());
      }
    }
  }, 5000);
}

/**
 * Create a smart poller instance
 * 
 * @param {Function} fetchFn - The async function to call for fetching data
 * @param {Object} options - Configuration options
 * @param {number} options.activeInterval - Polling interval when user is active (ms), default 15000
 * @param {number} options.idleInterval - Polling interval when user is idle (ms), default 60000
 * @param {boolean} options.fetchOnStart - Whether to fetch immediately on start, default true
 * @param {boolean} options.fetchOnVisible - Whether to fetch when tab becomes visible, default true
 * @param {string} options.name - Optional name for debugging
 * 
 * @returns {Object} Poller control object with start, stop, forceRefresh methods
 */
export function createSmartPoller(fetchFn, options = {}) {
  const {
    activeInterval = 15000,
    idleInterval = 60000,
    fetchOnStart = true,
    fetchOnVisible = true,
    name = 'unnamed'
  } = options;

  let intervalId = null;
  let isRunning = false;
  let currentInterval = activeInterval;
  let isMounted = true;

  initializeListeners();

  const poller = {
    name,
    
    async fetch() {
      if (!isMounted || !isRunning) return;
      try {
        await fetchFn();
      } catch (error) {
        console.error(`[SmartPoller:${name}] Fetch error:`, error);
      }
    },

    setInterval(interval) {
      if (currentInterval === interval) return;
      currentInterval = interval;
      
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = setInterval(() => this.fetch(), currentInterval);
      }
    },

    onVisible() {
      if (!isRunning) return;
      // Resume polling and optionally fetch immediately
      if (fetchOnVisible) {
        this.fetch();
      }
      this.setInterval(isUserActive ? activeInterval : idleInterval);
      if (!intervalId) {
        intervalId = setInterval(() => this.fetch(), currentInterval);
      }
    },

    onHidden() {
      // Pause polling when tab is hidden
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    onActive() {
      // Speed up polling when user becomes active
      this.setInterval(activeInterval);
    },

    onIdle() {
      // Slow down polling when user becomes idle
      this.setInterval(idleInterval);
    },

    start() {
      if (isRunning) return;
      isRunning = true;
      isMounted = true;
      activePollers.add(this);
      
      currentInterval = isUserActive ? activeInterval : idleInterval;
      
      if (fetchOnStart) {
        this.fetch();
      }
      
      if (isTabVisible) {
        intervalId = setInterval(() => this.fetch(), currentInterval);
      }
    },

    stop() {
      isRunning = false;
      isMounted = false;
      activePollers.delete(this);
      
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    forceRefresh() {
      return this.fetch();
    },

    isRunning() {
      return isRunning;
    }
  };

  return poller;
}

/**
 * React hook for smart polling
 * 
 * @param {Function} fetchFn - The async function to call for fetching data
 * @param {Array} deps - Dependencies array (like useEffect)
 * @param {Object} options - Polling options (same as createSmartPoller)
 * 
 * @returns {Object} { refresh: Function, isPolling: boolean }
 */
export function useSmartPolling(fetchFn, deps = [], options = {}) {
  // This is meant to be used with React's useEffect
  // Import this in React components and use like:
  // 
  // useEffect(() => {
  //   const poller = createSmartPoller(myFetchFn, { activeInterval: 10000 });
  //   poller.start();
  //   return () => poller.stop();
  // }, [deps]);
  
  throw new Error('useSmartPolling should be used inside a React component with useEffect. Use createSmartPoller directly for non-React code.');
}

/**
 * Get current polling state
 */
export function getPollingState() {
  return {
    isTabVisible,
    isUserActive,
    lastActivityTime,
    activePollerCount: activePollers.size
  };
}

/**
 * Pause all active pollers (useful for debugging or heavy operations)
 */
export function pauseAllPollers() {
  activePollers.forEach(poller => poller.onHidden());
}

/**
 * Resume all active pollers
 */
export function resumeAllPollers() {
  if (isTabVisible) {
    activePollers.forEach(poller => poller.onVisible());
  }
}

export default createSmartPoller;
