// Safe barrel — env gating + shared constants only, NO Stripe SDK import (so a
// module reading the application-fee constant never pulls the server-only SDK
// into a browser bundle). The Stripe client lives behind "./client".
export {
  applicationFeePercent,
  isStripeConfigured,
  isWebhookConfigured,
  assertTestModeKey,
  platformPriceForSeatBand,
  founderGraceEnabled,
} from "./env";
