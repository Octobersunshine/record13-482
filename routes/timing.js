const express = require('express');
const router = express.Router();
const timingStore = require('../utils/timingStore');
const fs = require('fs');
const path = require('path');

router.get('/summary', (req, res) => {
  const summary = timingStore.getCombinedSummary();
  res.json({ success: true, data: summary });
});

router.get('/routes', (req, res) => {
  const summary = timingStore.getRouteSummary();
  res.json({ success: true, data: summary });
});

router.get('/database', (req, res) => {
  const summary = timingStore.getDbSummary();
  res.json({ success: true, data: summary });
});

router.delete('/clear', (req, res) => {
  timingStore.clear();
  res.json({ success: true, message: 'All timing records cleared' });
});

router.get('/config', (req, res) => {
  res.json({ success: true, data: timingStore.getConfig() });
});

router.put('/config', (req, res) => {
  const config = timingStore.setConfig(req.body || {});
  res.json({ success: true, data: config, message: 'Config updated' });
});

router.get('/slow', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const includeDbOps = req.query.detail === 'true';
  const data = timingStore.getSlowRequests(limit, includeDbOps);
  res.json({ success: true, count: data.length, data });
});

router.get('/slow/:requestId', (req, res) => {
  const detail = timingStore.getSlowRequestDetail(req.params.requestId);
  if (!detail) {
    return res.status(404).json({ success: false, error: 'Slow request not found' });
  }
  res.json({ success: true, data: detail });
});

router.post('/slow/:requestId/export', (req, res) => {
  const filePath = timingStore.exportSlowRequestById(req.params.requestId);
  if (!filePath) {
    return res.status(404).json({ success: false, error: 'Slow request not found or export failed' });
  }
  res.json({ success: true, data: { filePath, fileName: path.basename(filePath) } });
});

router.post('/slow/export-all', (req, res) => {
  const result = timingStore.exportAllSlowRequests();
  res.json({ success: true, data: result });
});

router.get('/exports', (req, res) => {
  const files = timingStore.getExportedFiles();
  res.json({ success: true, count: files.length, data: files });
});

router.get('/exports/:fileName', (req, res) => {
  const data = timingStore.readExportFile(req.params.fileName);
  if (!data) {
    return res.status(404).json({ success: false, error: 'Export file not found' });
  }
  if (req.query.download === 'true') {
    res.set('Content-Disposition', `attachment; filename="${req.params.fileName}"`);
    res.set('Content-Type', 'application/json');
    return res.send(JSON.stringify(data, null, 2));
  }
  res.json({ success: true, data });
});

router.delete('/exports/:fileName', (req, res) => {
  const deleted = timingStore.deleteExportFile(req.params.fileName);
  if (!deleted) {
    return res.status(404).json({ success: false, error: 'Export file not found' });
  }
  res.json({ success: true, message: 'File deleted' });
});

router.delete('/exports', (req, res) => {
  const count = timingStore.deleteAllExportFiles();
  res.json({ success: true, message: `Deleted ${count} export files` });
});

router.get('/report', (req, res) => {
  const summary = timingStore.getCombinedSummary();
  const config = timingStore.getConfig();
  const { overall, route, database, slowRequests } = summary;

  let report = '='.repeat(70) + '\n';
  report += 'API Performance Report\n';
  report += '='.repeat(70) + '\n\n';

  report += 'CONFIGURATION\n';
  report += '-'.repeat(70) + '\n';
  report += `Slow Request Threshold: ${config.slowRequestThresholdMs}ms\n`;
  report += `Slow DB Op Threshold:   ${config.slowDbThresholdMs}ms\n`;
  report += `Auto Export Slow:        ${config.autoExportSlow ? 'ON' : 'OFF'}\n`;
  report += `Export Directory:        ${config.exportDir}\n\n`;

  report += 'OVERALL SUMMARY\n';
  report += '-'.repeat(70) + '\n';
  report += `Total Requests:          ${overall.totalRequests}\n`;
  report += `  Slow Requests:         ${overall.totalSlowRequests} (${route.slowRate}%)\n`;
  report += `Total DB Operations:     ${overall.totalDbOperations}\n`;
  report += `  Slow DB Ops:           ${overall.totalSlowDbOps} (${database.slowRate}%)\n`;
  report += `Total Time:              ${overall.totalTimeMs.toFixed(3)}ms\n`;
  report += `Route Time:              ${overall.routeTimePercentage}%\n`;
  report += `DB Time:                 ${overall.dbTimePercentage}%\n\n`;

  report += 'SLOW REQUESTS\n';
  report += '-'.repeat(70) + '\n';
  report += `Total Slow Requests: ${slowRequests.count}\n`;
  report += `Exported:            ${slowRequests.exported}\n`;
  const slowList = timingStore.getSlowRequests(10);
  if (slowList.length > 0) {
    report += '\nTop 10 Slow Requests:\n';
    slowList.forEach((r, idx) => {
      const exportedTag = r.exported ? ' [EXPORTED]' : '';
      report += `  ${String(idx + 1).padStart(2)}. ${r.method} ${r.path}\n`;
      report += `       Duration: ${r.totalDuration.toFixed(3)}ms  DB Ops: ${r.dbOpsCount}  DB Time: ${r.totalDbTime.toFixed(3)}ms${exportedTag}\n`;
      report += `       Status: ${r.statusCode}  Time: ${r.timestamp}  ID: ${r.requestId}\n`;
    });
  }
  report += '\n';

  report += 'ROUTE PERFORMANCE\n';
  report += '-'.repeat(70) + '\n';
  report += `Total: ${route.count} requests | Success: ${route.successCount} | Slow: ${route.slowCount} (${route.slowRate}%) | Error: ${route.errorCount} (${route.errorRate}%)\n`;
  report += `Avg: ${route.avg.toFixed(3)}ms | Min: ${route.min.toFixed(3)}ms | Max: ${route.max.toFixed(3)}ms\n\n`;

  report += 'By Route:\n';
  Object.keys(route.byRoute).forEach(key => {
    const r = route.byRoute[key];
    const slowInfo = r.slowCount > 0 ? ` [Slow: ${r.slowCount}]` : '';
    const errInfo = r.errorCount > 0 ? ` [Err: ${r.errorCount}]` : '';
    report += `  ${key.padEnd(30)}${slowInfo.padEnd(12)}${errInfo.padEnd(10)} Count: ${String(r.count).padStart(4)} | Avg: ${r.avg.toFixed(3).padStart(8)}ms | Min: ${r.min.toFixed(3).padStart(8)}ms | Max: ${r.max.toFixed(3).padStart(8)}ms\n`;
  });
  report += '\n';

  if (Object.keys(route.byEvent).length > 1 || route.byEvent.finish === undefined) {
    report += 'By Event Type:\n';
    Object.keys(route.byEvent).forEach(key => {
      const e = route.byEvent[key];
      report += `  ${key.padEnd(20)} Count: ${String(e.count).padStart(4)} | Avg: ${e.avg.toFixed(3).padStart(8)}ms\n`;
    });
    report += '\n';
  }

  if (Object.keys(route.byErrorType).length > 0) {
    report += 'Route Error Types:\n';
    Object.keys(route.byErrorType).forEach(key => {
      report += `  ${key.padEnd(30)} Count: ${route.byErrorType[key].count}\n`;
    });
    report += '\n';
  }

  report += 'DATABASE PERFORMANCE\n';
  report += '-'.repeat(70) + '\n';
  report += `Total: ${database.count} operations | Success: ${database.successCount} | Slow: ${database.slowCount} (${database.slowRate}%) | Error: ${database.errorCount} (${database.errorRate}%)\n`;
  report += `Avg: ${database.avg.toFixed(3)}ms | Min: ${database.min.toFixed(3)}ms | Max: ${database.max.toFixed(3)}ms\n\n`;

  report += 'By Operation:\n';
  Object.keys(database.byOperation).forEach(key => {
    const d = database.byOperation[key];
    const slowInfo = d.slowCount > 0 ? ` [Slow: ${d.slowCount}]` : '';
    const errInfo = d.errorCount > 0 ? ` [Err: ${d.errorCount}]` : '';
    report += `  ${key.padEnd(10)}${slowInfo.padEnd(12)}${errInfo.padEnd(10)} Count: ${String(d.count).padStart(4)} | Avg: ${d.avg.toFixed(3).padStart(8)}ms | Min: ${d.min.toFixed(3).padStart(8)}ms | Max: ${d.max.toFixed(3).padStart(8)}ms\n`;
  });
  report += '\n';

  if (Object.keys(database.byErrorType).length > 0) {
    report += 'DB Error Types:\n';
    Object.keys(database.byErrorType).forEach(key => {
      report += `  ${key.padEnd(30)} Count: ${database.byErrorType[key].count}\n`;
    });
    report += '\n';
  }

  report += '='.repeat(70) + '\n';

  res.set('Content-Type', 'text/plain');
  res.send(report);
});

module.exports = router;
