# GitHub Repo Research per Subsystem — July 2026

> License watch: AGPL repos (wger, formbricks, heyform, documenso, docuseal, opensign, soketi, cal.com) are fine self-hosted/unmodified, but network-served modifications must be open-sourced. ExerciseDB data is API-gated — prefer free-exercise-db/wger for redistributable content.

## Onboarding funnels
- [formbricks/formbricks](https://github.com/formbricks/formbricks) — ~11k★, open-source survey/funnel platform, AGPL-3.0
- [heyform/heyform](https://github.com/heyform/heyform) — ~8k★, conversational multi-step Typeform-style forms, AGPL-3.0
- [surveyjs/survey-library](https://github.com/surveyjs/survey-library) — ~4k★, JSON-driven multi-step wizard rendering, MIT
- [calcom/cal.com](https://github.com/calcom/cal.com) — ~35k★, scheduling infra (tier video calls), AGPL-3.0 core

## Adherence ledger references
- [wger-project/wger](https://github.com/wger-project/wger) — ~6k★, FLOSS workout/nutrition/weight tracker with REST API — best schema reference, AGPL-3.0
- [simonoppowa/OpenNutriTracker](https://github.com/simonoppowa/OpenNutriTracker) — calorie/meal tracker on Open Food Facts + USDA subset, GPL-3.0 (unverified)
- [SamR1/FitTrackee](https://github.com/SamR1/FitTrackee) — self-hosted activity tracker, privacy model reference, AGPL-3.0

## Nutrition data + allergen blocking
- [openfoodfacts/openfoodfacts-server](https://github.com/openfoodfacts/openfoodfacts-server) — ~3M products w/ allergen tags, AGPL code / ODbL data
- [openfoodfacts/openfoodfacts-js](https://github.com/openfoodfacts/openfoodfacts-js) — official JS/TS SDK, MIT (unverified)
- [littlebunch/fdc-api](https://github.com/littlebunch/fdc-api) — REST API over USDA FoodData Central CSVs (self-host verified DB)
- [jack-tol/usda-food-data-pipeline](https://github.com/jack-tol/usda-food-data-pipeline) — consolidates USDA FDC's 34 CSVs into one dataset
- [strangetom/ingredient-parser](https://github.com/strangetom/ingredient-parser) — free-text ingredient → structured (qty/unit/name)

## AI orchestration + structured output
- [anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) — official Agent SDK (TS), Zod/JSON-Schema structured outputs, MIT
- [anthropics/claude-cookbooks](https://github.com/anthropics/claude-cookbooks) — multi-agent orchestration patterns
- [567-labs/instructor](https://github.com/567-labs/instructor) — ~11k★ structured extraction (+ instructor-js), MIT
- [BoundaryML/baml](https://github.com/BoundaryML/baml) — typed LLM functions, schema-aligned parsing, Apache-2.0 (unverified)
- [colinhacks/zod](https://github.com/colinhacks/zod) — ~35k★, validation gate for every AI output, MIT

## Exercise DB + split designer
- [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) — ~4k★, 800+ exercises, public-domain JSON + images, Unlicense
- [wger-project/wger](https://github.com/wger-project/wger) — exercise DB w/ videos via REST, CC-BY-SA content
- [ExerciseDB/exercisedb-api](https://github.com/ExerciseDB/exercisedb-api) — 11k+ exercises w/ GIFs (API-gated licensing — caution)
- [exercemus/exercises](https://github.com/exercemus/exercises) — merged open exercise list
- [astashov/liftosaur](https://github.com/astashov/liftosaur) — scriptable planner w/ progression DSL — best progression-logic reference

## Real-time messaging + push
- [shwosner/realtime-chat-supabase-react](https://github.com/shwosner/realtime-chat-supabase-react) — chat on Supabase Realtime — **fits our stack, zero extra infra**
- [tinode/chat](https://github.com/tinode/chat) — ~12k★ full IM platform (Go), GPL-3.0
- [centrifugal/centrifugo](https://github.com/centrifugal/centrifugo) — ~9k★ self-hosted realtime server, Apache-2.0 (fallback if Supabase Realtime hits limits)
- [novuhq/novu](https://github.com/novuhq/novu) — ~35k★ notification infra: one API for push/in-app/email w/ digests + Inbox, MIT core
- [web-push-libs/web-push](https://github.com/web-push-libs/web-push) — Node Web Push (VAPID), MPL-2.0 (unverified)
- [expo/expo](https://github.com/expo/expo) — expo-notifications for FCM/APNs (v1.5 mobile)

## Dashboard/admin
- [refinedev/refine](https://github.com/refinedev/refine) — ~34k★ headless admin framework, Supabase provider built-in, MIT
- [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) — shadcn admin template, MIT
- [tremorlabs/tremor](https://github.com/tremorlabs/tremor) — ~16k★ charts/KPIs, Apache-2.0

## Payments / SaaS base
- [KolbySisk/next-supabase-stripe-starter](https://github.com/KolbySisk/next-supabase-stripe-starter) — Next.js+Supabase+Stripe+shadcn starter, MIT (unverified)
- [vercel/platforms](https://github.com/vercel/platforms) — ~6k★ official multi-tenant subdomain starter — trainer-branded portals pattern, MIT
- [stripe-samples/subscription-use-cases](https://github.com/stripe-samples/subscription-use-cases) — official subscription billing samples, MIT
- [stripe/stripe-demo-connect-kavholm-marketplace](https://github.com/stripe/stripe-demo-connect-kavholm-marketplace) — official Connect Express marketplace demo (archived) — exact trainer-payout shape, MIT
- [ixartz/SaaS-Boilerplate](https://github.com/ixartz/SaaS-Boilerplate) — ~5k★ multi-tenancy/RBAC/Stripe, MIT (unverified)

## Wearables
- [the-momentum/open-wearables](https://github.com/the-momentum/open-wearables) — ~1k★ self-hosted Terra alternative (Garmin/Polar/Whoop/Oura/Apple Health/Health Connect; RN SDK + MCP server), MIT
- [agencyenterprise/react-native-health](https://github.com/agencyenterprise/react-native-health) — ~3k★ HealthKit bridge, MIT
- [kingstinct/react-native-healthkit](https://github.com/kingstinct/react-native-healthkit) — TS-first HealthKit bindings, MIT
- [matinzd/react-native-health-connect](https://github.com/matinzd/react-native-health-connect) — Health Connect (Android), MIT (unverified URL)

## E-signature
- [documenso/documenso](https://github.com/documenso/documenso) — ~13.8k★ DocuSign alternative in TS/Next.js, AGPL-3.0
- [docusealco/docuseal](https://github.com/docusealco/docuseal) — ~13k★ embeddable signing + API/webhooks, AGPL-3.0
- [OpenSignLabs/OpenSign](https://github.com/opensignlabs/opensign) — simple signing workflows, AGPL-3.0

## PDF generation
- [diegomura/react-pdf](https://github.com/diegomura/react-pdf) — ~15.9k★ PDFs as React components, MIT
- [pdfme/pdfme](https://github.com/pdfme/pdfme) — ~3.4k★ WYSIWYG JSON template designer — trainer-customizable plan templates, MIT
- [typst/typst](https://github.com/typst/typst) — ~35k★ typesetting compiler, Apache-2.0
- [bpampuch/pdfmake](https://github.com/bpampuch/pdfmake) — ~12k★ declarative JS PDFs, MIT
