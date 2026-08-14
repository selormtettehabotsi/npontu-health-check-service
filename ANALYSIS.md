# Analysis

## What happens when one endpoint fails

That endpoint's check returns `status: "DOWN"` with the reason and the latency.
The other two are unaffected, since each check is independent and they run
concurrently. The overall response becomes `DEGRADED` with HTTP 503.

## "Down" is three different failures

**Hard down.** Connection refused, DNS failure, host unreachable. The kernel
rejects the socket, so this surfaces in milliseconds and is unambiguous. The
easiest case and the least dangerous.

**Timeout.** The connection is accepted but no response arrives. This is the
dangerous one, because it consumes resources on both ends for as long as you
allow it to. Without `AbortSignal.timeout(3000)` the request hangs
indefinitely and `/health` hangs with it, making the health check part of the
outage rather than the thing that reveals it.

**Degraded.** Valid responses, far too slowly. A pure up/down check misses this
entirely, because every status code is still 200. That is why each check
reports `latency_ms`: latency degradation is usually what you see before a hard
failure.

A fourth case this service does not catch is HTTP 200 with a body indicating
internal failure. Status-code checking sails straight past it. Catching it
means asserting on response content.

## Detecting it in production

**Something has to poll this endpoint.** A monitoring system scrapes it on a
schedule and records each result. The service reports; the monitoring system
decides.

**Alert on a sustained condition, not a single failure.** One failed poll is
usually a dropped packet. Requiring three consecutive failures costs about 90
seconds of detection latency at a 30-second interval and removes most false
alarms. An alert that fires spuriously is one people learn to ignore, and an
ignored alert is worse than no alert.

**Alert on latency, not just status.** This is what catches slow degradation
before it becomes a hard failure.

**Log state changes, not every check.** UP to DOWN transitions are your
incident timeline. Logging every successful check would bury the one that
matters under thousands of identical lines.

**Keep liveness separate from dependency health.** If this container's liveness
probe pointed at `/health`, an upstream outage would return 503 and the
orchestrator would restart a perfectly healthy process, turning a partial
outage into a total one. Liveness tests only whether this process is
responsive.

## Limitations

Checks run on request rather than on a schedule, so a high scrape rate puts
proportionally more load on the monitored endpoints. With enough pollers the
monitoring becomes a denial of service against the services it protects.
Caching for a few seconds, or a background polling loop that `/health` reads
from, would fix it.

Nothing is persisted, so there is no history and no uptime percentages.

A single vantage point cannot distinguish "the endpoint is down" from "my
network path to it is down", which is why production monitoring probes from
more than one location.

All three endpoints are treated as equally important. In a real system, losing
a non-essential dependency should read as degraded rather than a full outage.
