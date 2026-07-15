import Anthropic from "@anthropic-ai/sdk";

// Phase 0.5 wraps this factory with Langfuse tracing — keep all client
// construction here so tracing covers every call site.
let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    // Resolves credentials from the environment (ANTHROPIC_API_KEY).
    client = new Anthropic();
  }
  return client;
}
