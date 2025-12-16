/**
 * Frontend Performance Optimizer
 * Lazy loading, intersection observers, and performance monitoring
 */

(function () {
  "use strict";

  // ==================== LAZY LOADING IMAGES ====================

  function lazyLoadImages() {
    const images = document.querySelectorAll("img[data-src]");

    const imageObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
            observer.unobserve(img);
          }
        });
      },
      {
        rootMargin: "50px", // Load 50px before entering viewport
      }
    );

    images.forEach((img) => imageObserver.observe(img));
  }

  // ==================== DEBOUNCE HELPER ====================

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ==================== THROTTLE HELPER ====================

  function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  // ==================== PERFORMANCE MONITORING ====================

  class PerformanceMonitor {
    constructor() {
      this.metrics = {
        pageLoadTime: 0,
        domReadyTime: 0,
        firstPaintTime: 0,
        apiCalls: [],
      };

      this.init();
    }

    init() {
      // Measure page load performance
      window.addEventListener("load", () => {
        const perfData = performance.timing;
        this.metrics.pageLoadTime =
          perfData.loadEventEnd - perfData.navigationStart;
        this.metrics.domReadyTime =
          perfData.domContentLoadedEventEnd - perfData.navigationStart;

        // First paint
        const paintEntries = performance.getEntriesByType("paint");
        const firstPaint = paintEntries.find(
          (entry) => entry.name === "first-paint"
        );
        if (firstPaint) {
          this.metrics.firstPaintTime = firstPaint.startTime;
        }

        // Log performance
        console.log("📊 Performance Metrics:", {
          pageLoad: `${this.metrics.pageLoadTime}ms`,
          domReady: `${this.metrics.domReadyTime}ms`,
          firstPaint: `${this.metrics.firstPaintTime}ms`,
        });

        // Warn if slow
        if (this.metrics.pageLoadTime > 3000) {
          console.warn("⚠️ Page load time is slow (>3s)");
        }
      });
    }

    // Track API call performance
    trackAPICall(endpoint, duration) {
      this.metrics.apiCalls.push({
        endpoint,
        duration,
        timestamp: Date.now(),
      });

      // Warn if slow API call
      if (duration > 2000) {
        console.warn(`⚠️ Slow API call: ${endpoint} took ${duration}ms`);
      }
    }

    // Get average API response time
    getAvgAPITime() {
      if (this.metrics.apiCalls.length === 0) return 0;
      const total = this.metrics.apiCalls.reduce(
        (sum, call) => sum + call.duration,
        0
      );
      return Math.round(total / this.metrics.apiCalls.length);
    }

    // Get performance report
    getReport() {
      return {
        ...this.metrics,
        avgAPITime: this.getAvgAPITime(),
        totalAPICalls: this.metrics.apiCalls.length,
      };
    }
  }

  // ==================== RESOURCE HINTS ====================

  function addResourceHints() {
    const head = document.head;

    // DNS prefetch for external resources
    const dnsPrefetch = [
      "https://cdn.discordapp.com",
      "https://discord.com",
      "https://regular-puma-clearly.ngrok-free.app",
    ];

    dnsPrefetch.forEach((domain) => {
      const link = document.createElement("link");
      link.rel = "dns-prefetch";
      link.href = domain;
      head.appendChild(link);
    });

    // Preconnect to API
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://regular-puma-clearly.ngrok-free.app";
    head.appendChild(preconnect);
  }

  // ==================== OPTIMIZE ANIMATIONS ====================

  function optimizeAnimations() {
    // Reduce animations for users who prefer reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.style.setProperty("--animation-duration", "0s");
      console.log("♿ Reduced motion enabled");
    }
  }

  // ==================== CACHE API RESPONSES ====================

  class FrontendCache {
    constructor() {
      this.cache = new Map();
      this.maxAge = 5 * 60 * 1000; // 5 minutes
    }

    set(key, value) {
      this.cache.set(key, {
        value,
        timestamp: Date.now(),
      });
    }

    get(key) {
      const item = this.cache.get(key);
      if (!item) return null;

      // Check if expired
      if (Date.now() - item.timestamp > this.maxAge) {
        this.cache.delete(key);
        return null;
      }

      return item.value;
    }

    clear() {
      this.cache.clear();
    }
  }

  // ==================== OPTIMIZED FETCH ====================

  const apiCache = new FrontendCache();
  const perfMonitor = new PerformanceMonitor();

  window.optimizedFetch = async function (url, options = {}) {
    const cacheKey = `${url}-${JSON.stringify(options)}`;

    // Check cache first (for GET requests)
    if (!options.method || options.method === "GET") {
      const cached = apiCache.get(cacheKey);
      if (cached) {
        console.log(`💾 Cache hit: ${url}`);
        return cached;
      }
    }

    // Make request
    const startTime = performance.now();
    try {
      const response = await fetch(url, options);
      const data = await response.json();
      const duration = performance.now() - startTime;

      // Track performance
      perfMonitor.trackAPICall(url, duration);

      // Cache GET responses
      if (!options.method || options.method === "GET") {
        apiCache.set(cacheKey, data);
      }

      return data;
    } catch (error) {
      const duration = performance.now() - startTime;
      perfMonitor.trackAPICall(url, duration);
      throw error;
    }
  };

  // ==================== INIT ON DOM READY ====================

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function init() {
    lazyLoadImages();
    addResourceHints();
    optimizeAnimations();

    // Export performance monitor globally
    window.perfMonitor = perfMonitor;

    console.log("⚡ Frontend optimizations initialized");
  }

  // ==================== EXPOSE UTILITIES ====================

  window.performance = window.performance || {};
  window.performance.debounce = debounce;
  window.performance.throttle = throttle;
  window.performance.apiCache = apiCache;
})();
