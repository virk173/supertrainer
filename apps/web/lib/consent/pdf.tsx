import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// Branded PDF copy of a signed consent (Phase 2.3). Rendered from the SAME
// canonical text that was shown and hashed, plus the signature evidence, so the
// stored/emailed PDF matches the on-screen agreement exactly.

export interface ConsentPdfInput {
  trainerName: string;
  businessName: string;
  /** The rendered canonical consent text (from renderConsentDoc). */
  docText: string;
  signedName: string;
  signedAt: string;
  docVersion: string;
  docSha256: string;
  ip?: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, lineHeight: 1.5, color: "#222" },
  brandBar: { height: 6, backgroundColor: "#171717", marginBottom: 20 },
  title: { fontSize: 18, marginBottom: 4, color: "#111" },
  h2: { fontSize: 12, marginTop: 12, marginBottom: 3, color: "#111" },
  p: { marginBottom: 6 },
  sig: { marginTop: 24, padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 4 },
  sigRow: { flexDirection: "row", marginBottom: 3 },
  sigLabel: { width: 110, color: "#666" },
  hash: { fontFamily: "Courier", fontSize: 8, color: "#666" },
});

function renderBody(docText: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const lines = docText.split("\n");
  let para: string[] = [];
  const flush = (key: string) => {
    if (para.length) {
      nodes.push(
        <Text key={key} style={styles.p}>
          {para.join(" ")}
        </Text>,
      );
      para = [];
    }
  };
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flush(`p-${i}`);
    } else if (t.startsWith("## ")) {
      flush(`p-${i}`);
      nodes.push(
        <Text key={`h-${i}`} style={styles.h2}>
          {t.slice(3)}
        </Text>,
      );
    } else if (t.startsWith("# ")) {
      flush(`p-${i}`);
      nodes.push(
        <Text key={`t-${i}`} style={styles.title}>
          {t.slice(2)}
        </Text>,
      );
    } else {
      para.push(t.replace(/\*\*/g, ""));
    }
  });
  flush("p-final");
  return nodes;
}

export async function renderConsentPdf(input: ConsentPdfInput): Promise<Buffer> {
  // Build signature rows as data (no null JSX children — react-pdf can't
  // traverse them), then map to elements.
  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: "Signed by", value: input.signedName },
    { label: "Date", value: input.signedAt },
    { label: "Coach", value: `${input.trainerName} · ${input.businessName}` },
    { label: "Document", value: `version ${input.docVersion}` },
    ...(input.ip ? [{ label: "IP", value: input.ip }] : []),
    { label: "SHA-256", value: input.docSha256, mono: true },
  ];

  const doc = (
    <Document
      title={`Coaching consent — ${input.signedName}`}
      author={input.businessName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <View>{renderBody(input.docText)}</View>
        <View style={styles.sig}>
          {rows.map((row, i) => (
            <View key={i} style={styles.sigRow}>
              <Text style={styles.sigLabel}>{row.label}</Text>
              <Text style={row.mono ? styles.hash : undefined}>{row.value}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
