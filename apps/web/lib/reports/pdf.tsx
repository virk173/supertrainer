// Branded monthly progress report PDF (Phase 7.6b, react-pdf, server-side). Same
// brand system + neutral legal footer as the P4.5 plan PDF. Authored with
// React.createElement (no JSX) so the elements survive whichever JSX runtime
// transpiles this file (the test runner otherwise wraps them).

import { createElement as h, type ReactElement } from "react";

import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import type { MonthlyReport } from "@/lib/reports/monthly";

const DEFAULT_ACCENT = "#171717";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, color: "#1a1a1a", fontFamily: "Helvetica" },
  bar: { height: 6, marginBottom: 20 },
  org: { fontSize: 10, color: "#666", marginBottom: 2 },
  title: { fontSize: 20, marginBottom: 2 },
  period: { fontSize: 11, color: "#666", marginBottom: 20 },
  section: { marginBottom: 16 },
  h2: { fontSize: 9, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  big: { fontSize: 22 },
  label: { fontSize: 10, color: "#666" },
  note: { fontSize: 11, fontStyle: "italic", color: "#333", lineHeight: 1.5 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#999",
    textAlign: "center",
  },
});

function stat(value: string, label: string): ReactElement {
  return h(View, { key: label }, [
    h(Text, { key: "v", style: styles.big }, value),
    h(Text, { key: "l", style: styles.label }, label),
  ]);
}

// Returns a PDF Buffer for the route handler.
export async function renderReportPdf(report: MonthlyReport): Promise<Buffer> {
  const accent = report.accentFromBrand ?? DEFAULT_ACCENT;

  const weightLine =
    report.weightStart !== null && report.weightEnd !== null
      ? `${report.weightStart} kg → ${report.weightEnd} kg` +
        (report.weightDeltaKg !== null
          ? ` (${report.weightDeltaKg >= 0 ? "+" : ""}${report.weightDeltaKg} kg)`
          : "")
      : "Not enough weigh-ins this month";

  const doc = h(
    Document,
    {},
    h(Page, { size: "A4", style: styles.page }, [
      h(View, { key: "bar", style: [styles.bar, { backgroundColor: accent }] }),
      h(Text, { key: "org", style: styles.org }, report.orgName),
      h(Text, { key: "title", style: styles.title }, `${report.clientName} — Progress Report`),
      h(Text, { key: "period", style: styles.period }, report.periodLabel),

      h(View, { key: "adh", style: styles.section }, [
        h(Text, { key: "h", style: styles.h2 }, "Adherence"),
        h(View, { key: "r", style: styles.row }, [
          stat(report.adherence !== null ? String(report.adherence) : "—", report.bandLabel),
          stat(String(report.streak), "day streak"),
        ]),
      ]),

      h(View, { key: "wt", style: styles.section }, [
        h(Text, { key: "h", style: styles.h2 }, "Weight"),
        h(Text, { key: "v", style: { fontSize: 13 } }, weightLine),
      ]),

      h(View, { key: "pr", style: styles.section }, [
        h(Text, { key: "h", style: styles.h2 }, "Strength highlights"),
        ...(report.prs.length > 0
          ? report.prs.map((pr, i) =>
              h(View, { key: `pr${i}`, style: styles.row }, [
                h(Text, { key: "n", style: styles.label }, pr.name),
                h(Text, { key: "v" }, `${pr.e1rm} kg est. 1RM`),
              ]),
            )
          : [h(Text, { key: "none", style: styles.label }, "Log a few sessions to see your PRs here.")]),
      ]),

      h(View, { key: "note", style: styles.section }, [
        h(Text, { key: "h", style: styles.h2 }, "From your coach"),
        h(
          Text,
          { key: "v", style: styles.note },
          report.coachNote ?? "Your coach will add a personal note before this is shared.",
        ),
      ]),

      h(
        Text,
        { key: "footer", style: styles.footer },
        `Prepared by ${report.orgName} from the activity you logged. Not medical advice.`,
      ),
    ]),
  );

  return renderToBuffer(doc);
}
