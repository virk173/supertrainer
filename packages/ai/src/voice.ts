// Phase 3.2 — provider-agnostic speech-to-text seam for voice meal logging.
//
// The voice path is just the text path with an STT step in front: audio ->
// transcribe() -> parseMealText(). Claude has no STT endpoint, so this is the
// one place a provider (Deepgram, OpenAI Whisper, Google STT — pick per current
// best) gets wired. Following the project convention, it is a NO-OP without
// configuration: with no STT_API_KEY set, transcribeAudio throws
// SttNotConfiguredError and the portal falls back to manual text entry rather
// than failing. Wire a provider by filling in the single fetch below.

export type SttMediaType = "audio/webm" | "audio/mp4" | "audio/mpeg" | "audio/wav" | "audio/ogg";

export class SttNotConfiguredError extends Error {
  constructor() {
    super("Speech-to-text is not configured (set STT_PROVIDER + STT_API_KEY).");
    this.name = "SttNotConfiguredError";
  }
}

export interface TranscribeOptions {
  // BCP-47 language hint (from the client's profile locale) — improves accuracy.
  language?: string;
}

// Returns the transcript for a short voice note. Throws SttNotConfiguredError
// when no provider is set up (caller degrades to manual entry).
export async function transcribeAudio(
  audio: Uint8Array,
  mediaType: SttMediaType,
  opts: TranscribeOptions = {},
): Promise<string> {
  const provider = process.env.STT_PROVIDER;
  const apiKey = process.env.STT_API_KEY;
  if (!provider || !apiKey) throw new SttNotConfiguredError();

  // Single wiring point. Example (Deepgram):
  //   const res = await fetch("https://api.deepgram.com/v1/listen?smart_format=true" +
  //     (opts.language ? `&language=${opts.language}` : ""), {
  //     method: "POST",
  //     headers: { Authorization: `Token ${apiKey}`, "Content-Type": mediaType },
  //     body: audio,
  //   });
  //   const json = await res.json();
  //   return json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  throw new Error(`STT provider "${provider}" is set but not implemented; wire it in packages/ai/src/voice.ts`);
}

export function isSttConfigured(): boolean {
  return Boolean(process.env.STT_PROVIDER && process.env.STT_API_KEY);
}
