// Phase 9.6 — the realtime storm: many clients messaging at once, which is what
// a Monday morning looks like. Writes go through PostgREST with real client
// tokens so RLS, triggers and realtime fan-out are all in the path.
//
// SLO: p95 write < 400ms, and a subscriber sees a message within 2s. The
// delivery half is measured by the companion listener (see load/README.md) —
// k6 has no Supabase realtime client, and faking one here would measure nothing.
//
//   k6 run -e SUPABASE_URL=… -e ANON_KEY=… -e SERVICE_KEY=… load/k6/message-storm.js

import http from "k6/http";
import { check } from "k6";

const fixture = JSON.parse(open("../fixture.json"));
const url = __ENV.SUPABASE_URL;
const anonKey = __ENV.ANON_KEY;
const serviceKey = __ENV.SERVICE_KEY;

export const options = {
  scenarios: {
    storm: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const org = fixture.orgs[__VU % fixture.orgs.length];
  const clientId = org.clients[__ITER % org.clients.length];

  // Service key here on purpose: this scenario measures WRITE throughput and
  // realtime fan-out, not authorisation (which api-read.js covers with real
  // user tokens). Never point it at production.
  const res = http.post(
    `${url}/rest/v1/messages`,
    JSON.stringify({
      org_id: org.id,
      client_id: clientId,
      sender: "client",
      body: `load message ${__VU}-${__ITER}`,
    }),
    {
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
    },
  );
  check(res, { "message written": (r) => r.status === 201 });
}
