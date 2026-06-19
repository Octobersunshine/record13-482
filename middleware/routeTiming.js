const timingStore = require('../utils/timingStore');

function routeTiming(req, res, next) {
  const startTime = process.hrtime.bigint();
  const requestId = Math.random().toString(36).substring(2, 10);

  req.requestId = requestId;
  req.startTime = startTime;

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const record = {
      requestId,
      method: req.method,
      path: req.route ? req.route.path : req.path,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: Number(durationMs.toFixed(3)),
      timestamp: new Date().toISOString()
    };

    timingStore.addRouteTiming(record);
    console.log(`[Route] ${record.method} ${record.path} - ${record.duration}ms - Status: ${record.statusCode}`);
  });

  next();
}

module.exports = routeTiming;
