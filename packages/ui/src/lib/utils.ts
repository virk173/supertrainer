import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// The keyboard-focus ring for interactive elements that aren't Button/Input
// (bare nav links, icon toggles). Same treatment baked into those primitives'
// variants — keep the styling in one place so an a11y tweak lands everywhere.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
