// Branded plan PDF (Phase 4.5, react-pdf, server-side). Org header, a table per
// day type, prep notes, a grocery appendix, and the neutral legal footer
// (ORIGINAL-SPEC §6 — the plan is "prepared based on the dietary information you
// provided", not medical advice). renderPlanPdf returns a Buffer for the route.
//
// Authored with React.createElement (no JSX) deliberately: react-pdf elements
// must survive whichever JSX runtime transpiles this file — the Playwright test
// runner's JSX pragma otherwise wraps them and the reconciler rejects them.

import { createElement as h, type ReactElement } from "react";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { GroceryGroup } from "@/lib/plans/grocery";

export interface PdfMeal {
  slot: string;
  items: { name: string; grams: number; kcal: number }[];
  prepNote?: string;
}
export interface PdfDayType {
  name: string;
  kcal: number;
  protein_g: number;
  meals: PdfMeal[];
}
export interface PlanPdfData {
  orgName: string;
  accent: string;
  clientName: string;
  dayTypes: PdfDayType[];
  grocery: GroceryGroup[];
  socialLinks?: string[];
}

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#1a1a1a", fontFamily: "Helvetica" },
  h1: { fontSize: 18, marginBottom: 2 },
  sub: { fontSize: 9, color: "#666", marginBottom: 12 },
  dayTitle: { fontSize: 12, marginTop: 12, marginBottom: 4 },
  slot: { fontSize: 9, marginTop: 6, textTransform: "uppercase", color: "#888" },
  row: { flexDirection: "row", justifyContent: "space-between", marginTop: 1 },
  note: { fontSize: 8, color: "#666", fontStyle: "italic", marginTop: 1 },
  appendix: { fontSize: 12, marginTop: 16, marginBottom: 4 },
  cat: { fontSize: 9, marginTop: 6, textTransform: "uppercase" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#999", textAlign: "center" },
  bar: { height: 4, marginBottom: 10 },
});

const row = (left: string, right: string, key: string) =>
  h(View, { style: styles.row, key }, h(Text, null, left), h(Text, null, right));

function buildDocument(data: PlanPdfData): ReactElement {
  const dayBlocks = data.dayTypes.map((dt) =>
    h(
      View,
      { key: dt.name, wrap: false },
      h(Text, { style: styles.dayTitle }, `${dt.name.toUpperCase()} — ${dt.kcal} kcal · ${dt.protein_g}g protein`),
      ...dt.meals.map((m, mi) =>
        h(
          View,
          { key: mi },
          h(Text, { style: styles.slot }, m.slot),
          ...m.items.map((it, ii) => row(`${it.name} · ${it.grams}g`, `${it.kcal} kcal`, `${mi}-${ii}`)),
          m.prepNote ? h(Text, { style: styles.note, key: "note" }, m.prepNote) : null,
        ),
      ),
    ),
  );

  const groceryBlock = data.grocery.length
    ? h(
        View,
        { key: "grocery" },
        h(Text, { style: styles.appendix }, "Grocery list (1 week)"),
        ...data.grocery.map((g) =>
          h(
            View,
            { key: g.category, wrap: false },
            h(Text, { style: styles.cat }, g.category),
            ...g.items.map((it) => row(it.name, it.display, it.foodId)),
          ),
        ),
      )
    : null;

  const footer = `Prepared based on the dietary information you provided. Not medical advice.${
    data.socialLinks?.length ? `  ·  ${data.socialLinks.join("  ·  ")}` : ""
  }`;

  return h(
    Document,
    null,
    h(
      Page,
      { size: "A4", style: styles.page },
      h(View, { style: [styles.bar, { backgroundColor: data.accent || "#111" }] }),
      h(Text, { style: styles.h1 }, data.orgName),
      h(Text, { style: styles.sub }, `Diet plan for ${data.clientName}`),
      ...dayBlocks,
      groceryBlock,
      h(Text, { style: styles.footer, fixed: true }, footer),
    ),
  );
}

export function renderPlanPdf(data: PlanPdfData): Promise<Buffer> {
  return renderToBuffer(buildDocument(data) as unknown as Parameters<typeof renderToBuffer>[0]);
}
