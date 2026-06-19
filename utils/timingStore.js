class TimingStore {
  constructor() {
    this.routeTimings = [];
    this.dbTimings = [];
    this.maxRecords = 10000;
  }

  addRouteTiming(record) {
    this.routeTimings.push(record);
    if (this.routeTimings.length > this.maxRecords) {
      this.routeTimings.shift();
    }
  }

  addDbTiming(record) {
    this.dbTimings.push(record);
    if (this.dbTimings.length > this.maxRecords) {
      this.dbTimings.shift();
    }
  }

  getRouteSummary() {
    if (this.routeTimings.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, byRoute: {} };
    }

    const durations = this.routeTimings.map(r => r.duration);
    const byRoute = {};
    
    this.routeTimings.forEach(r => {
      const key = `${r.method} ${r.path}`;
      if (!byRoute[key]) {
        byRoute[key] = { count: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byRoute[key].count++;
      byRoute[key].total += r.duration;
      byRoute[key].avg = byRoute[key].total / byRoute[key].count;
      byRoute[key].min = Math.min(byRoute[key].min, r.duration);
      byRoute[key].max = Math.max(byRoute[key].max, r.duration);
    });

    return {
      count: this.routeTimings.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      byRoute
    };
  }

  getDbSummary() {
    if (this.dbTimings.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, byOperation: {} };
    }

    const durations = this.dbTimings.map(r => r.duration);
    const byOperation = {};

    this.dbTimings.forEach(r => {
      const key = r.operation;
      if (!byOperation[key]) {
        byOperation[key] = { count: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byOperation[key].count++;
      byOperation[key].total += r.duration;
      byOperation[key].avg = byOperation[key].total / byOperation[key].count;
      byOperation[key].min = Math.min(byOperation[key].min, r.duration);
      byOperation[key].max = Math.max(byOperation[key].max, r.duration);
    });

    return {
      count: this.dbTimings.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      byOperation
    };
  }

  getCombinedSummary() {
    const routeSummary = this.getRouteSummary();
    const dbSummary = this.getDbSummary();

    const totalRouteTime = routeSummary.count * routeSummary.avg;
    const totalDbTime = dbSummary.count * dbSummary.avg;
    const totalTime = totalRouteTime + totalDbTime;

    return {
      overall: {
        totalRequests: routeSummary.count,
        totalDbOperations: dbSummary.count,
        totalTimeMs: totalTime,
        routeTimePercentage: totalTime > 0 ? (totalRouteTime / totalTime * 100).toFixed(2) : 0,
        dbTimePercentage: totalTime > 0 ? (totalDbTime / totalTime * 100).toFixed(2) : 0
      },
      route: routeSummary,
      database: dbSummary,
      recentRecords: {
        routes: this.routeTimings.slice(-10).reverse(),
        dbOperations: this.dbTimings.slice(-10).reverse()
      }
    };
  }

  clear() {
    this.routeTimings = [];
    this.dbTimings = [];
  }
}

module.exports = new TimingStore();
