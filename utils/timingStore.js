const fs = require('fs');
const path = require('path');

class TimingStore {
  constructor() {
    this.routeTimings = [];
    this.dbTimings = [];
    this.slowRequests = [];
    this.maxRecords = 10000;
    this.maxSlowRequests = 1000;

    this.slowRequestThresholdMs = 50;
    this.slowDbThresholdMs = 30;
    this.autoExportSlow = true;
    this.exportDir = path.join(__dirname, '..', 'logs', 'slow-requests');

    this._ensureExportDir();
    this._pendingDbOps = new Map();
  }

  _ensureExportDir() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  setConfig(config) {
    if (config.slowRequestThresholdMs !== undefined) {
      this.slowRequestThresholdMs = config.slowRequestThresholdMs;
    }
    if (config.slowDbThresholdMs !== undefined) {
      this.slowDbThresholdMs = config.slowDbThresholdMs;
    }
    if (config.autoExportSlow !== undefined) {
      this.autoExportSlow = config.autoExportSlow;
    }
    return this.getConfig();
  }

  getConfig() {
    return {
      slowRequestThresholdMs: this.slowRequestThresholdMs,
      slowDbThresholdMs: this.slowDbThresholdMs,
      autoExportSlow: this.autoExportSlow,
      exportDir: this.exportDir
    };
  }

  beginRequest(requestId, metadata = {}) {
    this._pendingDbOps.set(requestId, []);
  }

  addRouteTiming(record) {
    this.routeTimings.push(record);
    if (this.routeTimings.length > this.maxRecords) {
      this.routeTimings.shift();
    }

    const requestId = record.requestId;
    const dbOps = this._pendingDbOps.get(requestId) || [];

    if (record.duration >= this.slowRequestThresholdMs) {
      const slowRecord = {
        requestId,
        isSlow: true,
        route: record,
        dbOperations: [...dbOps],
        totalDbTime: dbOps.reduce((sum, op) => sum + op.duration, 0),
        dbOpsCount: dbOps.length,
        slowDbOps: dbOps.filter(op => op.duration >= this.slowDbThresholdMs),
        exportedAt: null
      };

      this.slowRequests.push(slowRecord);
      if (this.slowRequests.length > this.maxSlowRequests) {
        this.slowRequests.shift();
      }

      if (this.autoExportSlow) {
        this._exportSlowRequest(slowRecord);
      }
    }

    this._pendingDbOps.delete(requestId);
  }

  addDbTiming(record) {
    this.dbTimings.push(record);
    if (this.dbTimings.length > this.maxRecords) {
      this.dbTimings.shift();
    }

    if (record.requestId && this._pendingDbOps.has(record.requestId)) {
      this._pendingDbOps.get(record.requestId).push(record);
    }
  }

  _exportSlowRequest(slowRecord) {
    try {
      this._ensureExportDir();
      const dateStr = slowRecord.route.timestamp.replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `${dateStr}_${slowRecord.route.method}_${slowRecord.route.path.replace(/[/:]/g, '_') || 'root'}_${slowRecord.requestId}.json`;
      const filePath = path.join(this.exportDir, fileName);

      const exportData = {
        exportedAt: new Date().toISOString(),
        requestId: slowRecord.requestId,
        summary: {
          method: slowRecord.route.method,
          path: slowRecord.route.path,
          url: slowRecord.route.url,
          statusCode: slowRecord.route.statusCode,
          totalDurationMs: slowRecord.route.duration,
          dbOpsCount: slowRecord.dbOpsCount,
          totalDbTimeMs: Number(slowRecord.totalDbTime.toFixed(3)),
          slowDbOpsCount: slowRecord.slowDbOps.length,
          routePercentage: slowRecord.totalDbTime > 0
            ? Number(((slowRecord.route.duration - slowRecord.totalDbTime) / slowRecord.route.duration * 100).toFixed(2))
            : 100,
          dbPercentage: slowRecord.totalDbTime > 0
            ? Number((slowRecord.totalDbTime / slowRecord.route.duration * 100).toFixed(2))
            : 0
        },
        timing: {
          route: {
            event: slowRecord.route.event,
            duration: slowRecord.route.duration,
            timestamp: slowRecord.route.timestamp
          },
          dbOperations: slowRecord.dbOperations.map((op, idx) => ({
            seq: idx + 1,
            operation: op.operation,
            duration: op.duration,
            isSlow: op.duration >= this.slowDbThresholdMs,
            sql: op.sql,
            params: op.params,
            error: op.error || null,
            timestamp: op.timestamp
          })),
          slowDbOperations: slowRecord.slowDbOps.map((op, idx) => ({
            seq: slowRecord.dbOperations.indexOf(op) + 1,
            operation: op.operation,
            duration: op.duration,
            sql: op.sql,
            params: op.params,
            error: op.error || null,
            timestamp: op.timestamp
          }))
        },
        raw: {
          route: slowRecord.route,
          dbOperations: slowRecord.dbOperations
        }
      };

      fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
      slowRecord.exportedAt = new Date().toISOString();
      slowRecord.exportFile = filePath;

      console.log(`[Slow Export] ${slowRecord.route.method} ${slowRecord.route.path} - ${slowRecord.route.duration}ms -> ${fileName}`);
      return filePath;
    } catch (error) {
      console.error(`[Slow Export] Failed to export: ${error.message}`);
      return null;
    }
  }

  exportSlowRequestById(requestId) {
    const record = this.slowRequests.find(r => r.requestId === requestId);
    if (!record) return null;
    return this._exportSlowRequest(record);
  }

  exportAllSlowRequests() {
    let successCount = 0;
    this.slowRequests.forEach(record => {
      if (this._exportSlowRequest(record)) {
        successCount++;
      }
    });
    return { exported: successCount, total: this.slowRequests.length };
  }

  getSlowRequests(limit = 100, includeDbOps = false) {
    const records = this.slowRequests.slice(-limit).reverse();
    if (!includeDbOps) {
      return records.map(r => ({
        requestId: r.requestId,
        method: r.route.method,
        path: r.route.path,
        url: r.route.url,
        statusCode: r.route.statusCode,
        totalDuration: r.route.duration,
        dbOpsCount: r.dbOpsCount,
        totalDbTime: Number(r.totalDbTime.toFixed(3)),
        slowDbOpsCount: r.slowDbOps.length,
        exported: !!r.exportedAt,
        exportFile: r.exportFile || null,
        timestamp: r.route.timestamp
      }));
    }
    return records;
  }

  getSlowRequestDetail(requestId) {
    return this.slowRequests.find(r => r.requestId === requestId) || null;
  }

  getExportedFiles() {
    this._ensureExportDir();
    const files = fs.readdirSync(this.exportDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(this.exportDir, f);
        const stat = fs.statSync(filePath);
        return {
          fileName: f,
          filePath,
          size: stat.size,
          created: stat.birthtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));
    return files;
  }

  readExportFile(fileName) {
    this._ensureExportDir();
    const filePath = path.join(this.exportDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }

  deleteExportFile(fileName) {
    this._ensureExportDir();
    const filePath = path.join(this.exportDir, fileName);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  deleteAllExportFiles() {
    this._ensureExportDir();
    let count = 0;
    fs.readdirSync(this.exportDir)
      .filter(f => f.endsWith('.json'))
      .forEach(f => {
        fs.unlinkSync(path.join(this.exportDir, f));
        count++;
      });
    return count;
  }

  getRouteSummary() {
    if (this.routeTimings.length === 0) {
      return {
        count: 0,
        slowCount: 0,
        errorCount: 0,
        successCount: 0,
        errorRate: 0,
        slowRate: 0,
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
    const slowRecords = this.routeTimings.filter(r => r.duration >= this.slowRequestThresholdMs);
    const byRoute = {};
    const byEvent = {};
    const byErrorType = {};

    this.routeTimings.forEach(r => {
      const key = `${r.method} ${r.path}`;
      if (!byRoute[key]) {
        byRoute[key] = { count: 0, slowCount: 0, errorCount: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byRoute[key].count++;
      byRoute[key].total += r.duration;
      byRoute[key].avg = byRoute[key].total / byRoute[key].count;
      byRoute[key].min = Math.min(byRoute[key].min, r.duration);
      byRoute[key].max = Math.max(byRoute[key].max, r.duration);
      if (r.error || r.event === 'error' || r.event === 'close' || r.event === 'next_error') {
        byRoute[key].errorCount++;
      }
      if (r.duration >= this.slowRequestThresholdMs) {
        byRoute[key].slowCount++;
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
      slowCount: slowRecords.length,
      errorCount: errorRecords.length,
      successCount: this.routeTimings.length - errorRecords.length,
      errorRate: (errorRecords.length / this.routeTimings.length * 100).toFixed(2),
      slowRate: (slowRecords.length / this.routeTimings.length * 100).toFixed(2),
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
        slowCount: 0,
        errorCount: 0,
        successCount: 0,
        errorRate: 0,
        slowRate: 0,
        avg: 0,
        min: 0,
        max: 0,
        byOperation: {},
        byErrorType: {}
      };
    }

    const durations = this.dbTimings.map(r => r.duration);
    const errorRecords = this.dbTimings.filter(r => r.error);
    const slowRecords = this.dbTimings.filter(r => r.duration >= this.slowDbThresholdMs);
    const byOperation = {};
    const byErrorType = {};

    this.dbTimings.forEach(r => {
      const key = r.operation;
      if (!byOperation[key]) {
        byOperation[key] = { count: 0, slowCount: 0, errorCount: 0, total: 0, avg: 0, min: Infinity, max: 0 };
      }
      byOperation[key].count++;
      byOperation[key].total += r.duration;
      byOperation[key].avg = byOperation[key].total / byOperation[key].count;
      byOperation[key].min = Math.min(byOperation[key].min, r.duration);
      byOperation[key].max = Math.max(byOperation[key].max, r.duration);
      if (r.error) {
        byOperation[key].errorCount++;
      }
      if (r.duration >= this.slowDbThresholdMs) {
        byOperation[key].slowCount++;
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
      slowCount: slowRecords.length,
      errorCount: errorRecords.length,
      successCount: this.dbTimings.length - errorRecords.length,
      errorRate: (errorRecords.length / this.dbTimings.length * 100).toFixed(2),
      slowRate: (slowRecords.length / this.dbTimings.length * 100).toFixed(2),
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
        totalSlowRequests: routeSummary.slowCount,
        totalDbOperations: dbSummary.count,
        totalSlowDbOps: dbSummary.slowCount,
        totalTimeMs: totalTime,
        routeTimePercentage: totalTime > 0 ? (totalRouteTime / totalTime * 100).toFixed(2) : 0,
        dbTimePercentage: totalTime > 0 ? (totalDbTime / totalTime * 100).toFixed(2) : 0
      },
      route: routeSummary,
      database: dbSummary,
      slowRequests: {
        count: this.slowRequests.length,
        exported: this.slowRequests.filter(r => r.exportedAt).length
      },
      recentRecords: {
        routes: this.routeTimings.slice(-10).reverse(),
        dbOperations: this.dbTimings.slice(-10).reverse()
      }
    };
  }

  clear() {
    this.routeTimings = [];
    this.dbTimings = [];
    this.slowRequests = [];
    this._pendingDbOps.clear();
  }
}

module.exports = new TimingStore();
