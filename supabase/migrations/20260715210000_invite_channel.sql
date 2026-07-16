-- Invite issuance fields (Phase 1.7). The invites table (P0) gains a channel,
-- an optional personal note, and open tracking; expiry moves to 14 days.

create type public.invite_channel as enum ('copy_link', 'email');

alter table public.invites
  add column channel public.invite_channel not null default 'copy_link',
  add column personal_message text,
  add column opened_at timestamptz;

-- Invites now last 14 days (was 7). Existing rows keep their expires_at.
alter table public.invites
  alter column expires_at set default now() + interval '14 days';
