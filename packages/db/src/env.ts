export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name} — see .env.example at the repo root`,
    );
  }
  return value;
}
