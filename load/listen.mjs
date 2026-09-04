#!/usr/bin/env node
// Phase 9.6 — the realtime half of the message-storm SLO.
//
// Subscribes to the messages table the way a portal does, and reports the
// observed write→deliver latency. Run it alongside k6's message-storm scenario.
//
//   node load/listen.mjs --seconds 120

import { createClient } from "@supabase/supabase-js";

const seconds = (() => {
  const i = process.argv.indexOf("--seconds");
  return i >= 0 ? Number(process.argv[i + 1]) : 120;
})();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

const client = createClient(url, serviceKey, { realtime: { params: { eventsPerSecond: 200 } } });
const latencies = [];

client
  .channel("load-listener")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
    const created = new Date(payload.new.created_at).getTime();
    latencies.push(Date.now() - created);
  })
  .subscribe((status) => console.log(`channel: ${status}`));

setTimeout(() => {
  if (latencies.length === 0) {
    console.error("No messages observed — is the storm running against this project?");
    process.exit(1);
  }
  latencies.sort((a, b) => a - b);
  const p = (q) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))];
  console.log(`observed ${latencies.length} deliveries`);
  console.log(`  p50 ${p(0.5)}ms   p95 ${p(0.95)}ms   max ${latencies.at(-1)}ms`);
  console.log(p(0.95) < 2000 ? "✓ within the 2s SLO" : "✗ over the 2s SLO");
  process.exit(p(0.95) < 2000 ? 0 : 1);
}, seconds * 1000);
