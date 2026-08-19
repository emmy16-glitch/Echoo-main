const baseUrl = String(
  process.env.ECHOO_PROBE_BASE_URL || 'http://127.0.0.1:5001'
).replace(/\/$/, '');
const broadcastId = String(process.env.ECHOO_PROBE_BROADCAST_ID || '').trim();
const concurrency = Math.max(
  1,
  Math.min(1000, Number(process.env.ECHOO_PROBE_CONCURRENCY) || 100)
);

if (!broadcastId) {
  console.error(
    'Set ECHOO_PROBE_BROADCAST_ID to a real public broadcast id before running this probe.'
  );
  process.exit(2);
}

const endpoint = `${baseUrl}/api/broadcasts/${encodeURIComponent(broadcastId)}/presence`;
const startedAt = performance.now();

const runOne = async (index) => {
  const started = performance.now();
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    await response.arrayBuffer();
    return {
      index,
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - started,
    };
  } catch (error) {
    return {
      index,
      ok: false,
      status: 0,
      durationMs: performance.now() - started,
      error: error?.message || String(error),
    };
  }
};

const results = await Promise.all(
  Array.from({ length: concurrency }, (_, index) => runOne(index))
);

const durations = results
  .map((result) => result.durationMs)
  .sort((a, b) => a - b);
const percentile = (ratio) => {
  if (!durations.length) return 0;
  const index = Math.min(
    durations.length - 1,
    Math.max(0, Math.ceil(durations.length * ratio) - 1)
  );
  return durations[index];
};

const statuses = results.reduce((summary, result) => {
  const key = String(result.status || 'network-error');
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});
const failures = results.filter((result) => !result.ok);

console.log(JSON.stringify({
  endpoint,
  concurrency,
  completed: results.length,
  successful: results.length - failures.length,
  failed: failures.length,
  totalDurationMs: Math.round(performance.now() - startedAt),
  latencyMs: {
    min: Math.round(durations[0] || 0),
    p50: Math.round(percentile(0.5)),
    p95: Math.round(percentile(0.95)),
    p99: Math.round(percentile(0.99)),
    max: Math.round(durations[durations.length - 1] || 0),
  },
  statuses,
  sampleErrors: failures.slice(0, 5).map((failure) => failure.error || failure.status),
}, null, 2));

if (failures.length) process.exitCode = 1;
