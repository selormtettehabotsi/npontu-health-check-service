// Loads .env into process.env. Silently does nothing if .env is absent, so the
// service still starts on the built-in defaults. Must run before any
// process.env is read below.
require('dotenv').config();

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS) || 3000;

// Endpoints come from the environment so no URLs are baked into source.
// The fallbacks point at the local mock server (see mock.js) so the project
// runs out of the box without depending on any third-party site.
const endpoints = [
    { name: process.env.SERVICE_1_NAME || 'auth-service',     url: process.env.SERVICE_1_URL || 'http://localhost:9001/status' },
    { name: process.env.SERVICE_2_NAME || 'payments-service', url: process.env.SERVICE_2_URL || 'http://localhost:9002/status' },
    { name: process.env.SERVICE_3_NAME || 'catalog-service',  url: process.env.SERVICE_3_URL || 'http://localhost:9003/status' }
];

/**
 * Check a single endpoint. Never throws, so one bad endpoint cannot break
 * the whole response.
 */
const checkEndpoint = async ({ name, url }) => {
    const start = Date.now();
    try {
        // AbortSignal.timeout caps the request. Without it, an endpoint that
        // accepts the connection but never replies would hang /health itself.
        const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        return {
            name,
            url,
            // response.ok is 200-299. Redirects are followed by fetch, so the
            // status seen here is always the final one.
            status: response.ok ? 'UP' : 'DOWN',
            http_status_code: response.status,
            latency_ms: Date.now() - start,
            error: response.ok ? null : `unexpected status ${response.status}`
        };
    } catch (error) {
        return {
            name,
            url,
            status: 'DOWN',
            http_status_code: null,
            latency_ms: Date.now() - start,
            error: error.name === 'TimeoutError'
                ? `timed out after ${TIMEOUT_MS}ms`
                : error.message
        };
    }
};

const startedAt = Date.now();

app.get('/health', async (req, res) => {
    // Concurrent: three timing-out endpoints take one timeout, not three.
    const checks = await Promise.all(endpoints.map(checkEndpoint));

    const up = checks.filter(c => c.status === 'UP').length;
    const down = checks.length - up;

    const body = {
        overall_status: down === 0 ? 'UP' : 'DEGRADED',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
        // Aggregates kept separate from the per-service results, so a consumer
        // never has to guess which keys are services and which are summary.
        metrics: {
            total_services_monitored: checks.length,
            healthy_services: up,
            unhealthy_services: down,
            average_latency_ms: Math.round(
                checks.reduce((sum, c) => sum + c.latency_ms, 0) / checks.length
            )
        },
        checks
    };

    // 503, not 207. Load balancers and Kubernetes probes treat any 2xx as
    // healthy, so a 207 would hide the outage from every system that matters.
    res.status(down === 0 ? 200 : 503).json(body);
});

app.listen(PORT, () => {
    console.log(`Health check service running on http://localhost:${PORT}`);
    console.log(`Monitoring: ${endpoints.map(e => e.name).join(', ')}`);
});
