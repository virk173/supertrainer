import "server-only";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import {
  visionExtractText,
  type VisionMediaType,
} from "@supertrainer/ai";
import type { Database } from "@supertrainer/db/types";

export type UploadKind = Database["public"]["Enums"]["upload_kind"];

const VISION_TYPES: VisionMediaType[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export interface ExtractedFile {
  text: string;
  kind: UploadKind;
}

// Extracts plain text from an uploaded file for the style extractors:
// text-layer PDFs via pdf-parse, docx via mammoth, images via Claude vision,
// plain text directly. The `kind` classifies the source for the uploads row.
export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractedFile> {
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const { text } = await parser.getText();
      return { text: text.trim(), kind: "plan_pdf" };
    } finally {
      await parser.destroy();
    }
  }

  if (mimeType === DOCX_TYPE) {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value.trim(), kind: "doc" };
  }

  if (VISION_TYPES.includes(mimeType as VisionMediaType)) {
    const text = await visionExtractText(
      buffer.toString("base64"),
      mimeType as VisionMediaType,
    );
    return { text, kind: "checkin_screenshot" };
  }

  if (mimeType.startsWith("text/")) {
    return { text: buffer.toString("utf8").trim(), kind: "doc" };
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}
