import { getClaudeClient } from "../claude";
import { modelRouter } from "../modelRouter";
import { withAiTask } from "../tracing";

export type VisionMediaType =
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/gif";

// Transcribes a trainer's uploaded image (a plan photo or a check-in
// screenshot) into plain text so the text-based style extractors can consume
// it. Routes through modelRouter('ingest') and is traced like every other call.
export async function visionExtractText(
  base64Data: string,
  mediaType: VisionMediaType,
): Promise<string> {
  const client = getClaudeClient();
  const model = modelRouter("ingest");

  const message = await withAiTask("ingest", () =>
    client.messages.create({
      model,
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64Data },
            },
            {
              type: "text",
              text: "This is a personal trainer's own material — a diet/training plan or a client check-in conversation. Transcribe ALL visible text verbatim, preserving structure (meals, exercises, sets/reps, message order and who is speaking). Output plain text only, no commentary.",
            },
          ],
        },
      ],
    }),
  );

  return message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
}
