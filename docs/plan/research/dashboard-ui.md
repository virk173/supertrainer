# World-Class Dashboard Resource Map — July 2026 (verified)

## Component libraries / design systems
- [shadcn/ui](https://ui.shadcn.com) — de-facto standard; Tailwind v4 + React 19; registry system distributes whole design systems. maintained ✓
- [shadcn registry directory](https://ui.shadcn.com/docs/directory) — index of ~58 community registries. ✓
- [Origin UI](https://originui.com) — 400+ free shadcn-compatible components; strongest gap-filler for data-dense app UI. ✓
- [Tremor](https://www.tremor.so) — 35 chart/dashboard components + 300 blocks; Vercel-owned, fully open-sourced. ✓
- [tweakcn](https://tweakcn.com) — visual theme editor for shadcn (OKLCH, 16+ presets, contrast checking); fastest escape from default-shadcn look. ✓
- [Untitled UI React](https://www.untitledui.com/react) — React Aria based, strong a11y; core open source. ✓
- [Magic UI](https://magicui.design) — 150+ animated components; landing pages, use sparingly in-app. ✓
- [Aceternity UI](https://ui.aceternity.com) — Framer-Motion showpieces; marketing site only. ✓
- [Radix Colors](https://www.radix-ui.com/colors) — 12-step semantic scales w/ auto dark pairing (1–2 bg, 3–5 UI, 6–8 borders, 9–10 solid, 11–12 text). ✓
- [Vercel Geist](https://vercel.com/geist/typography) — full open design system; closest public "10-year-old design system" to adopt wholesale. ✓

## Templates / starters
- [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) — ~11–12k★; 10+ pages, ⌘K palette, RTL; best UX reference. ✓
- [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) — ~6k★, Next.js 16 + shadcn + TS; best actual starting point. ✓ weekly commits
- [arhamkhnz/next-shadcn-admin-dashboard](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) — theme presets, multiple layouts. ✓
- [openstatus data-table](https://data-table.openstatus.dev/) — THE reference for data-dense tables (TanStack + faceted filters + URL state). ✓
- [makerkit/nextjs-saas-starter-kit-lite](https://github.com/makerkit/nextjs-saas-starter-kit-lite) — Supabase SaaS kit, B2B teams mode. ✓
- [ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate) — multi-tenancy, RBAC, Stripe, i18n, tests. ✓

## Data-viz verdict (2026)
- **shadcn/ui charts (Recharts v3)** for 90% of charts — official, composition-based. [ui.shadcn.com/charts](https://ui.shadcn.com/charts/area)
- **visx** for ONE signature bespoke viz max. [airbnb.io/visx](https://airbnb.io/visx/)
- **ECharts** only for very large time series (canvas, 100k+ points).
- Nivo: best default a11y but App Router incompatibility open as of May 2026 — avoid.

## Claude Code assets for UI quality
- **frontend-design skill** (Anthropic, ~277k installs) — inject before any UI code; main antidote to AI-slop convergence.
- **shadcn MCP server** — `npx shadcn@latest mcp init --client claude` — real component/registry APIs, no hallucinated props; works with Origin UI/Magic UI registries too.
- **Figma MCP + Claude Code** — bidirectional since Feb 2026 (read frames → code; push code → canvas).
- **Playwright MCP / webapp-testing skill** — screenshot → self-critique → fix loop; ~2 passes is the sweet spot.
- **v0 Platform API** — generate alternative treatments of a page that looks generic; cherry-pick.

## Design references
- [How Stripe, Linear, Vercel ship premium UI](https://mantlr.com/blog/stripe-linear-vercel-premium-ui) — premium = consistent craft, not one aesthetic: designed microstates, hairlines, focus rings, empty/loading states
- [Four design principles behind Stripe/Linear/Vercel](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel) — monochrome foundation, aggressive contrast, whitespace discipline
- Linear.app — study: 4px grid {4,8,12,16,24,32,48}, sidebar 240–280px, ⌘K palette
- Stripe Dashboard — study: neutral surfaces, single accent, semantic colors strictly for status, zero decorative color
- [Dashboard design patterns 2026](https://www.925studios.co/blog/saas-dashboard-design-examples-2026) — 5–9 core elements max, KPI strip of 4–6 cards, CSS Grid auto-fill

## Typography / spacing / a11y
- **Geist** (+ Geist Mono for numerals) — tuned for density; arguably best dashboard face 2026. Or **Inter** with `font-feature-settings: "tnum"` for metric columns.
- **4px grid**: spacing set {4, 8, 12, 16, 24, 32, 48} ONLY; ban arbitrary Tailwind values.
- One family, two weights. OKLCH color scales (shadcn/Tailwind v4 native); validate 4.5:1 body / 3:1 large text.
- Linear specs: sidebar 240–280px, ⌘K palette. Stripe: neutral surfaces, single accent, semantic color = status only, zero decorative color.

## Recipe — 10 steps to a top-1% dashboard with Claude Code
1. Scaffold from `Kiranism/next-shadcn-dashboard-starter` patterns (or existing app + `npx shadcn@latest init`); study `satnaing/shadcn-admin` for layout/UX.
2. Wire the design stack BEFORE UI code: frontend-design skill + shadcn MCP + Playwright screenshots (+ Figma MCP if refs exist).
3. Write a design-system CLAUDE.md: font (2 weights, tabular numerals), spacing {4,8,12,16,24,32,48} only, one radius, 1px `border` token only, single accent, semantic colors for status only, shadows ≤ shadow-sm, no gradients. This makes 50 sessions look like one designer.
4. Generate light+dark OKLCH themes in tweakcn (Radix 12-step mapping), verify contrast, export CSS vars. Never hardcode a hex again.
5. Shell like Linear/Stripe: 240–280px collapsible sidebar, KPI strip of 4–6 stat cards, CSS Grid auto-fill, max 5–9 elements per view, ⌘K (cmdk), breadcrumbs.
6. Tables on TanStack v8 + shadcn cloning openstatus pattern: server-side sort/pagination, faceted filters, URL filter state, bulk-action bar.
7. Charts: shadcn charts everywhere, one ChartContainer config, token colors only; sparklines in KPI cards; ONE bespoke visx signature viz; extra patterns from Tremor Blocks.
8. Design the unhappy paths: empty states w/ illustration+CTA, skeletons matching real geometry, inline errors, optimistic updates. The single biggest "10 years of polish" tell.
9. Screenshot iteration loop: dev server → Playwright screenshots (desktop+mobile+dark) → self-review against CLAUDE.md rules → fix. Two full passes; v0 for alternative treatments of stubborn pages.
10. Final gate: axe/lighthouse AA, keyboard nav, focus-visible, tnum on numeric columns, 150–200ms ease-out hover transitions only, hairlines over boxes, prune anything that doesn't convey information.
