import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "@playwright/test";

// Tests seed data through the service role — load apps/web/.env.local so the
// keys are available without exporting them in the shell.
const envFile = path.join(__dirname, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      // Strip surrounding quotes — `supabase status -o env` emits KEY="value",
      // and the raw quotes would otherwise poison the value we set (and, since
      // process.env wins over Next's own .env loading, break the dev server).
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
