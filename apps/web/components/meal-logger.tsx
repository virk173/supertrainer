"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2, Mic, Minus, Plus } from "lucide-react";

import {
  parseAndResolveText,
  proposeAndResolvePhoto,
  submitMealLog,
  transcribeAndResolveVoice,
  type ResolveResult,
} from "@/app/(app)/portal/log/actions";
import type { FoodOption, ResolvedItem } from "@/lib/ledger/resolve";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack", "other"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

// One editable row in the confirm card, seeded from a ResolvedItem.
interface EditItem {
  key: string;
  name: string; // the parsed name (kept for unverified items)
  qty: number;
  unit: string | null;
  options: FoodOption[];
  selectedId: string | null; // null = unverified freeform (no numbers)
  grams: number;
  needsPicker: boolean;
}

const FALLBACK_GRAMS = 100;

function optionById(item: EditItem): FoodOption | null {
  return item.options.find((o) => o.id === item.selectedId) ?? null;
}

function itemKcal(item: EditItem): number | null {
  const o = optionById(item);
  return o ? Math.round((o.kcalPer100g * item.grams) / 100) : null;
}

function toEditItems(items: ResolvedItem[]): EditItem[] {
  return items.map((it, i) => ({
    key: `${i}-${it.query.name}`,
    name: it.query.name,
    qty: it.query.qty,
    unit: it.query.unit,
    options: it.options,
    selectedId: it.selection?.id ?? null,
    grams: it.selection?.grams ?? FALLBACK_GRAMS,
    needsPicker: it.needsPicker || it.unverified,
  }));
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function MealLogger({
  defaultSlot,
  hasActivePlan,
}: {
  defaultSlot: MealSlot;
  hasActivePlan: boolean;
}) {
  const [slot, setSlot] = useState<MealSlot>(defaultSlot);
  const [text, setText] = useState("");
  const [items, setItems] = useState<EditItem[] | null>(null);
  const [method, setMethod] = useState<"text" | "photo" | "voice">("text");
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [loggedKcal, setLoggedKcal] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const total = (items ?? []).reduce((sum, it) => sum + (itemKcal(it) ?? 0), 0);

  function applyResult(result: ResolveResult, usedMethod: typeof method, raw: string | null) {
    setMethod(usedMethod);
    setRawInput(raw);
    setPhotoPath(result.photoPath ?? null);
    setItems(toEditItems(result.items));
    setLoggedKcal(null);
    setNote(result.items.length === 0 ? "No foods found — try naming them, e.g. \"2 rotis, dal\"." : null);
  }

  async function onParseText() {
    const raw = text.trim();
    if (!raw || busy) return;
    setBusy(true);
    setNote(null);
    try {
      applyResult(await parseAndResolveText(raw), "text", raw);
    } catch {
      setNote("Couldn't read that just now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onPhoto(file: File) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const mediaType = (file.type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";
      const b64 = await readAsBase64(file);
      applyResult(await proposeAndResolvePhoto(b64, mediaType), "photo", null);
    } catch {
      setNote("Couldn't read that photo — type what you ate instead.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!items || busy) return;
    setBusy(true);
    try {
      const res = await submitMealLog({
        mealSlot: slot,
        method,
        rawInput,
        photoPath,
        items: items.map((it) => ({
          foodId: it.selectedId,
          name: it.name,
          qty: it.qty,
          unit: it.unit,
          grams: it.grams,
        })),
      });
      setLoggedKcal(res.totals.kcal);
      setItems(null);
      setText("");
    } catch {
      setNote("Couldn't save that — please try again.");
    } finally {
      setBusy(false);
    }
  }

  function updateItem(key: string, patch: Partial<EditItem>) {
    setItems((prev) => prev?.map((it) => (it.key === key ? { ...it, ...patch } : it)) ?? null);
  }

  function stepGrams(item: EditItem, dir: 1 | -1) {
    const o = optionById(item);
    const units = o ? Object.values(o.servingUnits) : [];
    const step = units.length > 0 ? units[0] : 10;
    updateItem(item.key, { grams: Math.max(1, Math.round(item.grams + dir * step)) });
  }

  return (
    <div className="space-y-4" data-testid="meal-logger">
      <h1 className="text-xl font-semibold tracking-tight">Log a meal</h1>

      {/* Meal slot */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Meal">
        {MEAL_SLOTS.map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`slot-${s}`}
            onClick={() => setSlot(s)}
            aria-pressed={slot === s}
            className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
              slot === s ? "bg-foreground text-background" : "bg-surface-raised text-foreground hover:bg-surface"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loggedKcal !== null && (
        <div
          data-testid="meal-logged"
          className="rounded-lg border border-[var(--color-success)] bg-surface-raised p-4 text-sm"
        >
          <span className="font-medium">Logged.</span>{" "}
          {loggedKcal > 0 ? `≈ ${loggedKcal} kcal added to today.` : "Saved to today."}
        </div>
      )}

      {/* Input row */}
      {!items && (
        <div className="space-y-2">
          <textarea
            data-testid="meal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onParseText();
            }}
            rows={2}
            placeholder='What did you eat? e.g. "2 rotis, dal, salad"'
            className="w-full resize-none rounded-lg border bg-surface-raised p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="meal-parse"
              onClick={onParseText}
              disabled={busy || !text.trim()}
              className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {busy ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Add"}
            </button>
            <button
              type="button"
              aria-label="Log a photo"
              data-testid="meal-photo"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-lg border bg-surface-raised p-2 disabled:opacity-50"
            >
              <Camera className="size-5" />
            </button>
            <VoiceButton disabled={busy} onResult={(r, raw) => applyResult(r, "voice", raw)} setNote={setNote} />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhoto(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      )}

      {note && <p className="text-sm text-muted-foreground" data-testid="meal-note">{note}</p>}

      {/* Confirm card */}
      {items && (
        <div className="space-y-3 rounded-lg border bg-surface-raised p-3" data-testid="meal-confirm-card">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing to confirm — add foods above.</p>
          )}
          {items.map((it) => (
            <ItemRow key={it.key} item={it} onChange={updateItem} onStep={stepGrams} />
          ))}

          {items.length > 0 && (
            <>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="metric-label">Total</span>
                <span className="metric" data-testid="meal-total-kcal">
                  {total} kcal
                </span>
              </div>
              {!hasActivePlan && (
                <p className="text-xs text-muted-foreground">
                  Your coach hasn&apos;t set targets yet — logging in general mode.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setItems(null)}
                  className="rounded-lg border px-4 py-2 text-sm"
                >
                  Back
                </button>
                <button
                  type="button"
                  data-testid="meal-confirm"
                  onClick={onConfirm}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  Confirm
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  onChange,
  onStep,
}: {
  item: EditItem;
  onChange: (key: string, patch: Partial<EditItem>) => void;
  onStep: (item: EditItem, dir: 1 | -1) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(item.needsPicker && item.options.length > 1);
  const selected = item.options.find((o) => o.id === item.selectedId) ?? null;
  const kcal = selected ? Math.round((selected.kcalPer100g * item.grams) / 100) : null;

  return (
    <div className="space-y-2" data-testid="meal-item">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{selected ? selected.name : item.name}</p>
          <p className="text-xs text-muted-foreground">
            {selected ? (
              <>
                {item.grams} g
                {kcal !== null && ` · ${kcal} kcal`}
              </>
            ) : (
              <span data-testid="meal-item-unverified">Not in the food list — logged as-is (no calories)</span>
            )}
          </p>
        </div>
        {selected && (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" aria-label="Less" onClick={() => onStep(item, -1)} className="rounded-md border p-1">
              <Minus className="size-4" />
            </button>
            <button type="button" aria-label="More" onClick={() => onStep(item, 1)} className="rounded-md border p-1">
              <Plus className="size-4" />
            </button>
          </div>
        )}
      </div>

      {item.options.length > 1 && (
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="text-xs text-muted-foreground underline"
          data-testid="meal-item-change"
        >
          {pickerOpen ? "Hide options" : "Not right? Pick another"}
        </button>
      )}
      {pickerOpen && (
        <div className="flex flex-wrap gap-1">
          {item.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                onChange(item.key, { selectedId: o.id });
                setPickerOpen(false);
              }}
              aria-pressed={o.id === item.selectedId}
              className={`rounded-full border px-2 py-1 text-xs ${
                o.id === item.selectedId ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-surface-raised"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Voice note recorder. Uses MediaRecorder; on stop it transcribes via the STT
// seam. With no provider configured the action returns { configured: false } and
// we nudge the client to type instead — honest, never a hard error.
function VoiceButton({
  disabled,
  onResult,
  setNote,
}: {
  disabled: boolean;
  onResult: (result: ResolveResult, transcript: string) => void;
  setNote: (n: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setNote("Voice isn't available on this device — type instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const b64 = await readAsBase64(new File([blob], "note.webm", { type: "audio/webm" }));
        const out = await transcribeAndResolveVoice(b64, "audio/webm");
        if (!out.configured) setNote("Voice logging isn't set up yet — type or snap a photo.");
        else onResult(out.result, out.transcript);
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch {
      setNote("Couldn't access the mic — type instead.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <button
      type="button"
      aria-label={recording ? "Stop recording" : "Log by voice"}
      data-testid="meal-voice"
      onClick={recording ? stop : start}
      disabled={disabled}
      className={`rounded-lg border p-2 disabled:opacity-50 ${recording ? "bg-[var(--color-danger)] text-white" : "bg-surface-raised"}`}
    >
      <Mic className="size-5" />
    </button>
  );
}
