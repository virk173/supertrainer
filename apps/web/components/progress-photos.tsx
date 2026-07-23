"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";

import { saveProgressPhotoAction } from "@/app/(app)/portal/actions";

const POSES = ["front", "side", "back"] as const;
type Pose = (typeof POSES)[number];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Progress photos are monthly and large, so — unlike the quick-logs — they need
// connectivity (not queued offline). Front/side/back, visible only to the client
// and their trainer.
export function ProgressPhotos({ initialDone = {} }: { initialDone?: Partial<Record<Pose, boolean>> }) {
  const [done, setDone] = useState<Partial<Record<Pose, boolean>>>(initialDone);
  const [busy, setBusy] = useState<Pose | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Partial<Record<Pose, HTMLInputElement | null>>>({});

  async function upload(pose: Pose, file: File) {
    setBusy(pose);
    setError(null);
    try {
      const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
      const base64 = await readAsBase64(file);
      await saveProgressPhotoAction({ pose, base64, mediaType });
      setDone((d) => ({ ...d, [pose]: true }));
    } catch {
      setError("Couldn't upload that photo — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4" data-testid="progress-photos">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Progress photos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Front, side and back. Only you and your coach can see these.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {POSES.map((pose) => (
          <div key={pose}>
            <button
              type="button"
              data-testid={`progress-${pose}`}
              onClick={() => refs.current[pose]?.click()}
              disabled={busy !== null}
              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg border bg-surface-raised text-sm capitalize hover:bg-surface disabled:opacity-50"
            >
              {busy === pose ? (
                <Loader2 className="size-6 animate-spin" />
              ) : done[pose] ? (
                <Check className="size-6 text-[var(--color-success)]" />
              ) : (
                <Camera className="size-6 text-muted-foreground" />
              )}
              {pose}
            </button>
            <input
              ref={(el) => {
                refs.current[pose] = el;
              }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(pose, f);
                e.target.value = "";
              }}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
