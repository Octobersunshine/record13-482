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
      return {
        count: 0,
        errorCount: 0,
        successCount: 0,
        errorRate: 0,
        avg: 0,
        min: 0,
        max: 0,
        byRoute: {},
        byEvent: {},
        byErrorType: {}
      };
    }

    const durations = this.routeTimings.map(r => r.duration);
    const errorRecords = this.routeTimings.filter(r => r.error || r.event === 'error' || r.event === 'close' || r.event === 'next_error');
    const byRoute = {};
    const byEvent = {};
    const byErrorType = {};

    this.routeTimings.forEach(r => {
      const key = `${r.method} ${r.path}`;
      if (!byRoute[key]) {
        byRoute[key] = { count: 0, errorCount: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byRoute[key].count++;
      byRoute[key].total += r.duration;
      byRoute[key].avg = byRoute[key].total / byRoute[key].count;
      byRoute[key].min = Math.min(byRoute[key].min, r.duration);
      byRoute[key].max = Math.max(byRoute[key].max, r.duration);
      if (r.error || r.event === 'error' || r.event === 'close' || r.event === 'next_error') {
        byRoute[key].errorCount++;
      }

      const eventKey = r.event || 'finish';
      if (!byEvent[eventKey]) {
        byEvent[eventKey] = { count: 0, total: 0, avg: 0 };
      }
      byEvent[eventKey].count++;
      byEvent[eventKey].total += r.duration;
      byEvent[eventKey].avg = byEvent[eventKey].total / byEvent[eventKey].count;

      if (r.errorType) {
        if (!byErrorType[r.errorType]) {
          byErrorType[r.errorType] = { count: 0 };
        }
        byErrorType[r.errorType].count++;
      }
    });

    return {
      count: this.routeTimings.length,
      errorCount: errorRecords.length,
      successCount: this.routeTimings.length - errorRecords.length,
      errorRate: (errorRecords.length / this.routeTimings.length * 100).toFixed(2),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      byRoute,
      byEvent,
      byErrorType
    };
  }

  getDbSummary() {
    if (this.dbTimings.length === 0) {
      return {
        count: 0,
        errorCount: 0,
        successCount: 0,
        errorRate: 0,
        avg: 0,
        min: 0,
        max: 0,
        byOperation: {},
        byErrorType: {}
      };
    }

    const durations = this.dbTimings.map(r => r.duration);
    const errorRecords = this.dbTimings.filter(r => r.error);
    const byOperation = {};
    const byErrorType = {};

    this.dbTimings.forEach(r => {
      const key = r.operation;
      if (!byOperation[key]) {
        byOperation[key] = { count: 0, errorCount: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byOperation[key].count++;
      byOperation[key].total += r.duration;
      byOperation[key].avg = byOperation[key].total / byOperation[key].count;
      byOperation[key].min = Math.min(byOperation[key].min, r.duration);
      byOperation[key].max = Math.max(byOperation[key].max, r.duration);
      if (r.error) {
        byOperation[key].errorCount++;
      }

      if (r.errorType) {
        if (!byErrorType[r.errorType]) {
          byErrorType[r.errorType] = { count: 0 };
        }
        byErrorType[r.errorType].count++;
      }
    });

    return {
      count: this.dbTimings.length,
      errorCount: errorRecords.length,
      successCount: this.dbTimings.length - errorRecords.length,
      errorRate: (errorRecords.length / this.dbTimings.length * 100).toFixed(2),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      byOperation,
      byErrorType
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
