const timingStore = require('../utils/timingStore');
const { asyncLocalStorage } = require('../db');

function routeTiming(req, res, next) {
  const startTime = process.hrtime.bigint();
  const requestId = Math.random().toString(36).substring(2, 10);
  let recorded = false;

  req.requestId = requestId;
  req.startTime = startTime;

  timingStore.beginRequest(requestId, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  });

  const recordTiming = (eventType, error) => {
    if (recorded) return;
    recorded = true;

    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1e6;

    const record = {
      requestId,
      method: req.method,
      path: req.route ? req.route.path : req.path,
      url: req.originalUrl,
      statusCode: res.statusCode,
      event: eventType,
      duration: Number(durationMs.toFixed(3)),
      timestamp: new Date().toISOString()
    };

    if (error) {
      record.error = error.message || String(error);
      record.errorType = error.constructor ? error.constructor.name : 'Unknown';
    }

    timingStore.addRouteTiming(record);

    const isSlow = record.duration >= timingStore.getConfig().slowRequestThresholdMs;
    const slowLabel = isSlow ? ' [SLOW]' : '';

    if (error) {
      console.log(`[Route]${slowLabel} ${record.method} ${record.path} - ${record.duration}ms - ${record.event} - Status: ${record.statusCode} - Error: ${record.error}`);
    } else if (eventType === 'close') {
      console.log(`[Route]${slowLabel} ${record.method} ${record.path} - ${record.duration}ms - CONNECTION_CLOSED - Status: ${record.statusCode}`);
    } else {
      console.log(`[Route]${slowLabel} ${record.method} ${record.path} - ${record.duration}ms - Status: ${record.statusCode}`);
    }
  };

  res.on('finish', () => {
    recordTiming('finish', null);
  });

  res.on('close', () => {
    if (!recorded) {
      recordTiming('close', null);
    }
  });

  res.on('error', (error) => {
    recordTiming('error', error);
  });

  if (next) {
    asyncLocalStorage.run({ requestId }, () => {
      try {
        next();
      } catch (error) {
        recordTiming('next_error', error);
        throw error;
      }
    });
  }
}

module.exports = routeTiming;
