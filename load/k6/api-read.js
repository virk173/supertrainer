// Phase 9.6 — the read path under load, through RLS with real trainer tokens.
//
// SLO: p95 < 400ms, zero non-2xx. If this fails, the first suspects are
// connection pooling (Supabase pooler mode) and a missing index on the
// (org_id, …) predicate the failing query uses — check the slow-query log before
// changing application code.
//
//   k6 run -e SUPABASE_URL=… -e ANON_KEY=… load/k6/api-read.js

import http from "k6/http";
import { check } from "k6";

const fixture = JSON.parse(open("../fixture.json"));
const url = __ENV.SUPABASE_URL;
const anonKey = __ENV.ANON_KEY;

export const options = {
  scenarios: {
    roster_reads: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "1m", target: 50 },
        { duration: "3m", target: 50 },
        { duration: "1m", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const who = fixture.trainerTokens[__VU % fixture.trainerTokens.length];
  const headers = {
    apikey: anonKey,
    authorization: `Bearer ${who.token}`,
    accept: "application/json",
  };

  // The roster query the dashboard makes on every load.
  const roster = http.get(
    `${url}/rest/v1/clients?select=id,status,intake&org_id=eq.${who.orgId}&limit=50`,
    { headers, tags: { query: "roster" } },
  );
  check(roster, { "roster 200": (r) => r.status === 200 });

  // The forensic grid's ledger read — the heaviest normal query in the product.
  const ledger = http.get(
    `${url}/rest/v1/weigh_ins?select=client_id,tz_date,weight_kg&org_id=eq.${who.orgId}&order=tz_date.desc&limit=500`,
    { headers, tags: { query: "ledger" } },
  );
  check(ledger, { "ledger 200": (r) => r.status === 200 });
}
