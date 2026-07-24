// Phase 6.3 — the comms-router: fail-closed two-gate intent classification +
// escalation. Absorbs the P2.5 health gate (health.ts) and adds the broader
// routing (escalation | routine_autonomous | conversational | plan_impact).

export {
  HEALTH_FLAG_CATEGORIES,
  keywordHealthFlags,
  detectHealthFlags,
  type HealthFlagCategory,
  type HealthFlagResult,
} from "./health";

export {
  keywordEscalation,
  type EscalationCategory,
  type EscalationKeywordResult,
} from "./keywords";

export {
  classifyRoute,
  ROUTE_CATEGORIES,
  type RouteCategory,
  type RoutingClassification,
  type RouteClassifier,
} from "./classifier";

export {
  routeMessage,
  CONFIDENCE_FLOOR,
  type RouteResult,
  type RouteDeps,
} from "./router";

export { ROUTE_FIXTURES, type RouteFixture } from "./fixtures";
