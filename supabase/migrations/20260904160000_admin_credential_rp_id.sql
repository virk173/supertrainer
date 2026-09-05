-- Phase 9.3 follow-up — bind each console credential to the hostname it was
-- registered on.
--
-- A WebAuthn credential is cryptographically scoped to a relying-party id (our
-- hostname). Before this migration we counted an operator's credentials without
-- regard to RP, which produced a lockout: register a key on one domain, move
-- NEXT_PUBLIC_APP_URL to another, and /admin offers "unlock" with a credential
-- the browser cannot produce, while refusing to register a replacement because
-- one already exists. The only way out was hand-deleting a row in production.
--
-- With rp_id recorded, a new hostname simply has no credentials yet and the
-- operator registers a first key there — which is what the WebAuthn model
-- already implies.

-- Any pre-existing row cannot be a real operator's key: /admin is unreachable
-- until PLATFORM_ADMIN_EMAILS names someone, and it has never been set in
-- production. Local rows are test fixtures. So we can require the column
-- outright rather than carry a nullable legacy case forever.
delete from public.admin_credentials;

alter table public.admin_credentials
  add column rp_id text not null;

comment on column public.admin_credentials.rp_id is
  'The WebAuthn relying-party id (our hostname) this credential was registered against. A credential is only usable on the RP it was created for.';

-- The hot lookup is "this profile's credentials for THIS hostname".
create index admin_credentials_profile_rp_idx
  on public.admin_credentials (profile_id, rp_id);
