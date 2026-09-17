-- I03 synthetic-policy infrastructure. NOT an automatic migration.
-- Owner approved synthetic implementation only on 2026-09-12. Shared tracker:
-- PR56 / issue45. Apply only with consent-policy-db.py in an isolated database.
-- This script deliberately refuses every other database name, installs no
-- policies, and seeds the control with NULL (disabled). No env activation path.
-- A separately reviewed forward migration + verified backup/restore + explicit
-- approval are required before any real deployment. Never replay/reset live DB.
-- No historical data UPDATE or consent default. Future live adapters/public
-- wording/stale-form UX remain gated. Ordinary operational edits stay allowed.
-- Hashes bind bytes, not proof a human read them. Trusted writers can forge a
-- matching tuple; superuser DDL/COPY restore with triggers disabled is outside
-- this guarantee. No new deletion/retention/marketing policy is introduced.
-- Rollback for this experiment: discard ONLY its unique disposable database.
-- Do not convert that cleanup rule into permission to drop production evidence.

begin;
do $$
begin
  if current_database() !~ '^consent_synthetic_[0-9a-f]{32}$' then
    raise exception 'Synthetic consent database required';
  end if;
end;
$$;

create schema consent_private;
revoke all on schema consent_private from public, anon, authenticated, service_role;
grant usage on schema consent_private to service_role;

create table consent_private.policy_versions (
  version text primary key check (version ~ '^[a-z][a-z0-9-]{0,63}$'),
  canonical text not null check (octet_length(canonical) between 1 and 262144),
  hash text not null check (hash ~ '^[a-f0-9]{64}$'),
  constraint policy_bytes_hash check (hash = encode(sha256(convert_to(canonical,'UTF8')),'hex')),
  constraint policy_identity check (
    jsonb_typeof(canonical::jsonb) = 'object'
    and (canonical::jsonb ->> 'version') is not null
    and (canonical::jsonb ->> 'version') = version
    and (canonical::jsonb ->> 'schema') is not null
    and (canonical::jsonb ->> 'schema') = '1'
  ),
  unique (version, hash)
);
alter table consent_private.policy_versions enable row level security;
revoke all on consent_private.policy_versions from public, anon, authenticated, service_role;
grant select on consent_private.policy_versions to service_role;

create table consent_private.control (
  singleton boolean primary key check (singleton),
  active_version text references consent_private.policy_versions(version) on update restrict on delete restrict
);
insert into consent_private.control(singleton,active_version) values(true,null);
alter table consent_private.control enable row level security;
revoke all on consent_private.control from public, anon, authenticated, service_role;
grant select on consent_private.control to service_role;

create function consent_private.refuse_evidence_change() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  raise exception using errcode='23514', message='Consent evidence is immutable';
end;
$$;
revoke all on function consent_private.refuse_evidence_change() from public, anon, authenticated, service_role;
create trigger immutable_policy_rows before update or delete on consent_private.policy_versions
for each row execute function consent_private.refuse_evidence_change();
create trigger immutable_policy_table before truncate on consent_private.policy_versions
for each statement execute function consent_private.refuse_evidence_change();
create trigger preserve_consent_control before delete on consent_private.control
for each row execute function consent_private.refuse_evidence_change();
create trigger preserve_consent_control_table before truncate on consent_private.control
for each statement execute function consent_private.refuse_evidence_change();

alter table public.leads
  add column consent_policy_version text,
  add column consent_policy_hash text,
  add column consent_capture_method text,
  add constraint lead_consent_tuple check (
    (consent_policy_version is null and consent_policy_hash is null and consent_capture_method is null)
    or (consent_policy_version is not null and consent_policy_hash is not null
      and consent_capture_method is not null and consent_capture_method='explicit-checkbox-v1')
  ),
  add constraint lead_consent_policy foreign key(consent_policy_version,consent_policy_hash)
    references consent_private.policy_versions(version,hash) match full on update restrict on delete restrict;

create function consent_private.guard_lead_evidence() returns trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare
  active text;
begin
  if TG_OP = 'UPDATE' then
    if row(NEW.consent_at,NEW.consent_policy_version,NEW.consent_policy_hash,NEW.consent_capture_method)
       is distinct from row(OLD.consent_at,OLD.consent_policy_version,OLD.consent_policy_hash,OLD.consent_capture_method) then
      raise exception using errcode='23514',message='Consent evidence is immutable';
    end if;
    return NEW;
  end if;

  -- Share lock remains until INSERT transaction completion. Operator activation
  -- UPDATE takes an incompatible lock: either the old insert commits before
  -- activation, or the insert sees the newly committed version and must match.
  select active_version into active from consent_private.control where singleton for share;
  if not found then
    raise exception using errcode='23514',message='Consent control unavailable';
  end if;
  if active is null then
    if NEW.consent_policy_version is not null or NEW.consent_policy_hash is not null or NEW.consent_capture_method is not null then
      raise exception using errcode='23514',message='Consent version capture disabled';
    end if;
  elsif NEW.consent_policy_version is distinct from active
     or NEW.consent_policy_hash is null
     or NEW.consent_capture_method is distinct from 'explicit-checkbox-v1'
     or NEW.consent_at is null then
    raise exception using errcode='23514',message='Current explicit consent evidence required';
  end if;
  return NEW;
end;
$$;
revoke all on function consent_private.guard_lead_evidence() from public, anon, authenticated, service_role;
create trigger guard_lead_consent_evidence before insert or update on public.leads
for each row execute function consent_private.guard_lead_evidence();

commit;
