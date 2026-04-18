-- Phase 2.2: invite-based household joining.
--
-- Two tables:
--   invites         — single-use join codes, owner-created, 7-day default expiry
--   invite_attempts — audit trail for rate-limiting redemptions (5 per 10 min)
--
-- Design notes:
--   - Code is a 6-char string from a 31-char ambiguity-free alphabet
--     (ABCDEFGHJKMNPQRSTUVWXYZ23456789). Lower-case is not used; redemption
--     normalizes input to upper-case.
--   - Single-use: once `redeemed_at` is set the row is inert. If two people
--     need to join, the owner generates two codes.
--   - RLS: owners can CRUD invites for their households; nobody else can
--     SELECT invites. Redemption itself runs under service_role from a
--     server action (after the rate-limit check) so we don't need a
--     "redeem" policy for `authenticated` — that would require exposing
--     all invites to any logged-in user, defeating the point.
--   - `invite_attempts` is service-role-only: both reads (rate-limit check)
--     and writes happen inside the redeem action, never from the client.

create table invites (
  code char(6) primary key,
  household_id uuid not null references households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  -- Belt-and-suspenders: the alphabet check stops e.g. a bad client-side
  -- generator from inserting "000000" via admin calls.
  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  check (expires_at > created_at),
  check (
    (redeemed_at is null and redeemed_by is null)
    or (redeemed_at is not null and redeemed_by is not null)
  )
);

create index idx_invites_household on invites (household_id);
-- Hot path on `/invite/[code]`: look up by code, still active.
create index idx_invites_active
  on invites (code)
  where redeemed_at is null;

create table invite_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code char(6) not null,
  success boolean not null,
  attempted_at timestamptz not null default now()
);

-- Rate-limit lookup: last N attempts per user in a time window.
create index idx_invite_attempts_user_time
  on invite_attempts (user_id, attempted_at desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table invites enable row level security;
alter table invite_attempts enable row level security;

-- Owners see their household's invites (for the manage UI).
create policy "invites_select_owner"
  on invites for select to authenticated
  using (public.is_household_owner(household_id));

-- Owners create invites they'll hand out; `created_by = auth.uid()` to
-- keep the audit trail honest.
create policy "invites_insert_owner"
  on invites for insert to authenticated
  with check (
    public.is_household_owner(household_id)
    and created_by = auth.uid()
  );

-- Owners can revoke (delete) pending invites.
create policy "invites_delete_owner"
  on invites for delete to authenticated
  using (public.is_household_owner(household_id));

-- No update policy. The redemption flow flips redeemed_at/by via the
-- service_role client inside the server action; direct UPDATE from
-- authenticated users is blocked.

-- invite_attempts has no SELECT/INSERT/UPDATE/DELETE policies for
-- authenticated. RLS-enabled + no policies = deny-all. The server
-- action uses service_role, which bypasses RLS.
