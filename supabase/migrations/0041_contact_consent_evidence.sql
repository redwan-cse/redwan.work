-- F20/I03 development-only integration, owner approval 2026-09-28.
-- Forward schema source, not authority to apply to production or activate.
-- Existing rows remain NULL/unknown; no UPDATE/backfill or policy seed.
-- Apply only through an independently approved rollout after verified backup
-- and isolated restore. Do not reset/replay the production database.
-- Disabling capture is not permission to erase archived or recorded evidence.
begin;

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
  select active_version into active from consent_private.control where singleton for share;
  if not found then
    raise exception using errcode='PT503',message='Consent control unavailable';
  end if;
  if active is null then
    if NEW.consent_policy_version is not null or NEW.consent_policy_hash is not null or NEW.consent_capture_method is not null then
      raise exception using errcode='PT503',message='Consent version capture disabled';
    end if;
  elsif NEW.consent_policy_version is distinct from active
     or NEW.consent_policy_hash is null
     or NEW.consent_capture_method is distinct from 'explicit-checkbox-v1'
     or NEW.consent_at is null then
    raise exception using errcode='PT409',message='Current explicit consent evidence required';
  end if;
  return NEW;
end;
$$;
revoke all on function consent_private.guard_lead_evidence() from public, anon, authenticated, service_role;
create trigger guard_lead_consent_evidence before insert or update on public.leads
for each row execute function consent_private.guard_lead_evidence();

-- A single statement snapshot, bounded to active + requested archived policy.
-- Runtime roles cannot publish, activate or enumerate the registry via this RPC.
create function public.contact_consent_control(p_displayed_version text default null)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object(
    'schema', 1,
    'activeVersion', c.active_version,
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'version', p.version, 'canonical', p.canonical, 'hash', p.hash
      ) order by p.version)
      from consent_private.policy_versions p
      where c.active_version is not null
        and (p.version = c.active_version or p.version = p_displayed_version)
    ), '[]'::jsonb)
  )
  from consent_private.control c
  where c.singleton;
$$;
revoke all on function public.contact_consent_control(text) from public, anon, authenticated, service_role;
grant execute on function public.contact_consent_control(text) to service_role;

commit;
