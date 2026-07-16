// Shared form-state type + initial value. Kept out of actions.ts because a
// "use server" module may only export async functions.
export interface BrandFormState {
  ok: boolean;
  message?: string;
  errors: Partial<Record<"displayName" | "slug" | "primaryColor", string>>;
}

export const initialBrandFormState: BrandFormState = { ok: false, errors: {} };
