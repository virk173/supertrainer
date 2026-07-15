// Placeholder schema types. Regenerated in Phase 0.2 (and after every migration) with:
//   npx supabase gen types typescript --local > packages/db/src/types.ts
// Do not hand-edit table definitions once generation is wired up.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
