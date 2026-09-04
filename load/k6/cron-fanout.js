// Phase 9.6 — the scheduled fan-outs, which are where this product actually
// falls over: one tick touches every org at once.
//
// SLO: each tick completes inside its Vercel maxDuration with headroom, and
// never returns a non-2xx. Run this against a staging deployment seeded with
// load/seed.mjs; it is NOT a concurrency test (crons don't overlap) — it
// measures a single tick's wall time against a realistic dataset.
//
//   k6 run -e BASE_URL=… -e CRON_SECRET=… load/k6/cron-fanout.js

import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

const base = __ENV.BASE_URL;
const secret = __ENV.CRON_SECRET;

const tick = new Trend("cron_tick_ms", true);

export const options = {
  scenarios: {
    ticks: { executor: "per-vu-iterations", vus: 1, iterations: 3, maxDuration: "20m" },
  },
  thresholds: {
    // Vercel's default function ceiling is 300s; a tick that needs more than a
    // third of it on staging will not survive a real Monday morning.
    "cron_tick_ms{job:morning-digest}": ["p(95)<100000"],
    "cron_tick_ms{job:reminders}": ["p(95)<100000"],
    "cron_tick_ms{job:day-close}": ["p(95)<100000"],
    http_req_failed: ["rate==0"],
  },
};

const JOBS = ["day-close", "reminders", "morning-digest", "check-in-cards", "weekly-recap"];

export default function () {
  for (const job of JOBS) {
    const started = Date.now();
    const res = http.get(`${base}/api/cron/${job}`, {
      headers: { authorization: `Bearer ${secret}` },
      timeout: "300s",
      tags: { job },
    });
    tick.add(Date.now() - started, { job });
    check(res, { [`${job} 200`]: (r) => r.status === 200 });
  }
}
