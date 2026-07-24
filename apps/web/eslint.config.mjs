import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Phase 7 DESIGN.md enforcement: hardcoded hex colors are a lint error in
// on-screen chrome — every color must come from a semantic design token
// (packages/ui globals.css). Matches #rgb / #rgba / #rrggbb / #rrggbbaa in both
// plain string literals (incl. Tailwind arbitrary values like `bg-[#fff]`) and
// template strings. The `\b` guards against matching longer identifiers.
const HEX = "#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b";
const HEX_MESSAGE =
  "Hardcoded hex color — use a semantic design token instead (see CLAUDE.md DESIGN.md). Token-exempt output (PDFs, emails, manifest, OG/icon, brand-color feature) is whitelisted in eslint.config.mjs.";
const noHardcodedHex = {
  "no-restricted-syntax": [
    "error",
    { selector: `Literal[value=/${HEX}/]`, message: HEX_MESSAGE },
    { selector: `TemplateElement[value.raw=/${HEX}/]`, message: HEX_MESSAGE },
  ],
};

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  // The hex guard applies to all app/component/lib TypeScript.
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: noHardcodedHex,
  },
  // Token-exempt contexts where a literal hex is correct and unavoidable:
  //  - PDFs (react-pdf has its own style system, no CSS vars)
  //  - transactional emails (inline styles only; no stylesheet reaches an inbox)
  //  - PWA manifest / OG image / app-icon routes (spec fields take literal hex)
  //  - the trainer brand-color feature (its whole job is a hex value)
  //  - global-error (renders outside the token layer when the root tree throws)
  //  - tests (brand-color fixtures assert on literal hex)
  {
    files: [
      "lib/**/pdf.tsx",
      "lib/email/**/*.{ts,tsx}",
      "lib/push/digest.ts",
      "app/api/**/*.{ts,tsx}",
      "app/manifest.webmanifest/**/*.{ts,tsx}",
      "app/**/pdf/route.{ts,tsx}",
      "components/brand-form.tsx",
      "app/onboarding/brand/**/*.{ts,tsx}",
      "app/global-error.tsx",
      "tests/**/*.{ts,tsx}",
    ],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default eslintConfig;
