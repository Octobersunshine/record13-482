const express = require('express');
const router = express.Router();
const timingStore = require('../utils/timingStore');

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

router.get('/report', (req, res) => {
  const summary = timingStore.getCombinedSummary();
  const { overall, route, database } = summary;

  let report = '='.repeat(70) + '\n';
  report += 'API Performance Report\n';
  report += '='.repeat(70) + '\n\n';

  report += 'OVERALL SUMMARY\n';
  report += '-'.repeat(70) + '\n';
  report += `Total Requests:      ${overall.totalRequests}\n`;
  report += `Total DB Operations: ${overall.totalDbOperations}\n`;
  report += `Total Time:          ${overall.totalTimeMs.toFixed(3)}ms\n`;
  report += `Route Time:          ${overall.routeTimePercentage}%\n`;
  report += `DB Time:             ${overall.dbTimePercentage}%\n\n`;

  report += 'ROUTE PERFORMANCE\n';
  report += '-'.repeat(70) + '\n';
  report += `Total: ${route.count} requests | Success: ${route.successCount} | Error: ${route.errorCount} | Error Rate: ${route.errorRate}%\n`;
  report += `Avg: ${route.avg.toFixed(3)}ms | Min: ${route.min.toFixed(3)}ms | Max: ${route.max.toFixed(3)}ms\n\n`;

  report += 'By Route:\n';
  Object.keys(route.byRoute).forEach(key => {
    const r = route.byRoute[key];
    const errInfo = r.errorCount > 0 ? ` [Err: ${r.errorCount}]` : '';
    report += `  ${key.padEnd(32)}${errInfo.padEnd(10)} Count: ${String(r.count).padStart(4)} | Avg: ${r.avg.toFixed(3).padStart(8)}ms | Min: ${r.min.toFixed(3).padStart(8)}ms | Max: ${r.max.toFixed(3).padStart(8)}ms\n`;
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
  report += `Total: ${database.count} operations | Success: ${database.successCount} | Error: ${database.errorCount} | Error Rate: ${database.errorRate}%\n`;
  report += `Avg: ${database.avg.toFixed(3)}ms | Min: ${database.min.toFixed(3)}ms | Max: ${database.max.toFixed(3)}ms\n\n`;

  report += 'By Operation:\n';
  Object.keys(database.byOperation).forEach(key => {
    const d = database.byOperation[key];
    const errInfo = d.errorCount > 0 ? ` [Err: ${d.errorCount}]` : '';
    report += `  ${key.padEnd(10)}${errInfo.padEnd(10)} Count: ${String(d.count).padStart(4)} | Avg: ${d.avg.toFixed(3).padStart(8)}ms | Min: ${d.min.toFixed(3).padStart(8)}ms | Max: ${d.max.toFixed(3).padStart(8)}ms\n`;
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
