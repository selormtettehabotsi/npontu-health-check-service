# Health Check Service

Monitors three endpoints and exposes their status and metrics via `/health`.

Node 18+ (native `fetch` and `AbortSignal.timeout`), Express. Analysis in
[ANALYSIS.md](./ANALYSIS.md).

## Running it

Two terminals. The first starts three local mocks so the project runs without
depending on any external site:

```bash
npm install
npm run mock     # terminal 1, mocks on 9001, 9002, 9003
npm start        # terminal 2, service on 3000
```

```bash
curl -s localhost:3000/health | jq
```

The third mock returns 503 on purpose, so a fresh run shows the failure path
immediately.

## `GET /health`

200 when all three are up, 503 when any is down.

```json
{
  "overall_status": "DEGRADED",
  "timestamp": "2026-08-12T11:37:15.646Z",
  "uptime_seconds": 3,
  "metrics": {
    "total_services_monitored": 3,
    "healthy_services": 2,
    "unhealthy_services": 1,
    "average_latency_ms": 12
  },
  "checks": [
    {
      "name": "auth-service",
      "url": "http://localhost:9001/status",
      "status": "UP",
      "http_status_code": 200,
      "latency_ms": 8,
      "error": null
    },
    {
      "name": "payments-service",
      "url": "http://localhost:9002/status",
      "status": "UP",
      "http_status_code": 200,
      "latency_ms": 11,
      "error": null
    },
    {
      "name": "catalog-service",
      "url": "http://localhost:9003/status",
      "status": "DOWN",
      "http_status_code": 503,
      "latency_ms": 17,
      "error": "unexpected status 503"
    }
  ]
}
```

Aggregates sit under `metrics` and per-service results under `checks`, so a
consumer never has to work out which keys are services and which are summary.

## Configuration

All config comes from environment variables via `dotenv`. No URLs or
credentials in source. `.env` is gitignored; `.env.example` is committed as the
template and documents every variable the service reads. If `.env` is absent
the service falls back to the local mocks, so a fresh clone runs with no setup.

Against real services:

```bash
SERVICE_1_NAME=api SERVICE_1_URL=https://api.example.com/health npm start
```

## Design notes

**Every check has a timeout.** Without one, an endpoint that accepts a
connection but never replies would hang `/health` itself, making the health
check part of the outage instead of the thing that reveals it.

**Checks run concurrently** via `Promise.all`. Sequentially, three timing-out
endpoints cost three timeouts; concurrently, one.

**`checkEndpoint` never throws.** A failure returns a `DOWN` result, so one
unreachable endpoint can't break the whole response.

**503, not 207.** Load balancers and Kubernetes probes treat any 2xx as
healthy, so a `207 Multi-Status` would hide a real outage from every system
meant to react to it.

**Latency is reported per endpoint**, because an endpoint that is slow but
still responding is a real problem a boolean would hide.

## Files

```
server.js      the service and the /health endpoint
mock.js        three local endpoints (the third fails on purpose)
ANALYSIS.md    written analysis
```
