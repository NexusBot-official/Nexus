// Performance Monitoring Helper
// Tracks Core Web Vitals and other performance metrics

(function () {
  "use strict";

  // Only run if browser supports Performance API
  if (
    typeof window === "undefined" ||
    !window.performance ||
    !window.performance.mark
  ) {
    return;
  }

  const metrics = {
    navigationStart: performance.timing.navigationStart,
    pageLoadTime: 0,
    domContentLoaded: 0,
    firstPaint: 0,
    firstContentfulPaint: 0,
    largestContentfulPaint: 0,
    firstInputDelay: 0,
    cumulativeLayoutShift: 0,
    timeToInteractive: 0,
  };

  // Track page load time
  window.addEventListener("load", () => {
    metrics.pageLoadTime =
      performance.timing.loadEventEnd - performance.timing.navigationStart;
    metrics.domContentLoaded =
      performance.timing.domContentLoadedEventEnd -
      performance.timing.navigationStart;

    // Log to console in development
    if (
      window.location.hostname === "localhost" ||
      window.location.hostname.includes("127.0.0.1")
    ) {
      console.log("[Performance] Page Load Time:", metrics.pageLoadTime, "ms");
      console.log(
        "[Performance] DOM Content Loaded:",
        metrics.domContentLoaded,
        "ms"
      );
    }
  });

  // Track First Contentful Paint (FCP)
  if ("PerformanceObserver" in window) {
    try {
      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === "first-paint") {
            metrics.firstPaint = entry.startTime;
          } else if (entry.name === "first-contentful-paint") {
            metrics.firstContentfulPaint = entry.startTime;
            if (
              window.location.hostname === "localhost" ||
              window.location.hostname.includes("127.0.0.1")
            ) {
              console.log(
                "[Performance] First Contentful Paint:",
                entry.startTime,
                "ms"
              );
            }
          }
        }
      });
      paintObserver.observe({ entryTypes: ["paint"] });
    } catch (e) {
      // PerformanceObserver not supported or error
    }

    // Track Largest Contentful Paint (LCP)
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        metrics.largestContentfulPaint =
          lastEntry.renderTime || lastEntry.loadTime;
        if (
          window.location.hostname === "localhost" ||
          window.location.hostname.includes("127.0.0.1")
        ) {
          console.log(
            "[Performance] Largest Contentful Paint:",
            metrics.largestContentfulPaint,
            "ms"
          );
        }
      });
      lcpObserver.observe({ entryTypes: ["largest-contentful-paint"] });
    } catch (e) {
      // LCP not supported
    }

    // Track First Input Delay (FID)
    try {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.processingStart - entry.startTime > 0) {
            metrics.firstInputDelay = entry.processingStart - entry.startTime;
            if (
              window.location.hostname === "localhost" ||
              window.location.hostname.includes("127.0.0.1")
            ) {
              console.log(
                "[Performance] First Input Delay:",
                metrics.firstInputDelay,
                "ms"
              );
            }
          }
        }
      });
      fidObserver.observe({ entryTypes: ["first-input"] });
    } catch (e) {
      // FID not supported
    }

    // Track Cumulative Layout Shift (CLS)
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            metrics.cumulativeLayoutShift = clsValue;
          }
        }
        if (
          window.location.hostname === "localhost" ||
          window.location.hostname.includes("127.0.0.1")
        ) {
          console.log("[Performance] Cumulative Layout Shift:", clsValue);
        }
      });
      clsObserver.observe({ entryTypes: ["layout-shift"] });
    } catch (e) {
      // CLS not supported
    }
  }

  // Track API call performance
  const originalFetch = window.fetch;
  window.fetch = function (...args) {
    const startTime = performance.now();
    return originalFetch.apply(this, args).then(
      (response) => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        // Log slow API calls (> 1 second)
        if (
          duration > 1000 &&
          (window.location.hostname === "localhost" ||
            window.location.hostname.includes("127.0.0.1"))
        ) {
          console.warn(
            `[Performance] Slow API call: ${args[0]} took ${duration.toFixed(2)}ms`
          );
        }

        return response;
      },
      (error) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        if (
          window.location.hostname === "localhost" ||
          window.location.hostname.includes("127.0.0.1")
        ) {
          console.error(
            `[Performance] API call failed: ${args[0]} after ${duration.toFixed(2)}ms`,
            error
          );
        }
        throw error;
      }
    );
  };

  // Expose metrics globally for debugging
  window.NexusPerformanceMetrics = metrics;

  // Function to get performance summary
  window.getPerformanceSummary = function () {
    return {
      pageLoadTime: metrics.pageLoadTime,
      domContentLoaded: metrics.domContentLoaded,
      firstContentfulPaint: metrics.firstContentfulPaint,
      largestContentfulPaint: metrics.largestContentfulPaint,
      firstInputDelay: metrics.firstInputDelay,
      cumulativeLayoutShift: metrics.cumulativeLayoutShift,
      memoryUsage: performance.memory
        ? {
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit,
          }
        : null,
    };
  };
})();
