// Shared query helpers every phase inherits.

// Excludes demo clients from a clients query — apply to EVERY analytics
// aggregate, export, and billing count so the badged "Alex Demo" client never
// skews real numbers. Generic over the Supabase filter builder so it stays
// chainable: excludeDemoClients(supabase.from("clients").select("id")).
export function excludeDemoClients<
  Q extends { eq(column: "is_demo", value: boolean): Q },
>(query: Q): Q {
  return query.eq("is_demo", false);
}
