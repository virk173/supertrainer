-- PO-6 — AI lead-intent scoring on teaser submission.
--
-- Stage A answers already contain enough to triage follow-up, but the trainer
-- has no signal to tell hot leads from tire-kickers. submitLead now runs a cheap
-- modelRouter('classify') pass (Haiku, best-effort) over the answers and stores a
-- QUALITATIVE band + one-line reason here (never an LLM-computed number — rule 4).
-- Rendered as a sort/priority signal in the PO-1 Prospects view.
--
-- leads grants API roles SELECT only (public writes go through the submit
-- action's service role), so these columns need no new grants and no client
-- access path — staff read them under the existing leads RLS.

create type public.lead_intent_band as enum ('high', 'medium', 'low');

alter table public.leads
  add column intent_band public.lead_intent_band,
  add column intent_reason text;
