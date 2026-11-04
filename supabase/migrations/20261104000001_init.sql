-- ByteVoice Bangladesh: core schema
-- One clinic can have many doctors, services, patients, calls and appointments.
-- Every call keeps its transcript, the fields the AI extracted, every tool the
-- agent ran, and any appointment it created or changed.

create extension if not exists btree_gist;  -- needed for the no-double-booking rule

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type call_status        as enum ('live', 'ended', 'failed');
create type call_outcome       as enum ('booked', 'rescheduled', 'cancelled', 'enquiry',
                                        'follow_up_needed', 'incomplete', 'failed', 'spam');
create type call_intent        as enum ('book', 'reschedule', 'cancel', 'enquiry', 'other');
create type speaker            as enum ('agent', 'caller', 'system');
create type appointment_status as enum ('scheduled', 'cancelled', 'completed', 'no_show');
create type appointment_event  as enum ('booked', 'rescheduled', 'cancelled');
create type actor              as enum ('ai_agent', 'staff');
create type callback_status    as enum ('open', 'done');
create type staff_role         as enum ('admin', 'receptionist');

-- ---------------------------------------------------------------------------
-- Clinic setup
-- ---------------------------------------------------------------------------
create table clinics (
  id            uuid primary key default gen_random_uuid(),
  name_bn       text not null,
  name_en       text not null,
  address_bn    text not null,
  address_en    text not null,
  phone_e164    text not null,
  timezone      text not null default 'Asia/Dhaka',
  info          jsonb not null default '{}',   -- hours, directions, FAQs the agent may quote
  created_at    timestamptz not null default now()
);

create table doctors (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  full_name_bn  text not null,
  full_name_en  text not null,
  title_en      text,                           -- e.g. BDS, FCPS
  specialty_bn  text,
  specialty_en  text,
  active        boolean not null default true
);

create table services (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  code          text not null,                  -- stable key the agent uses, e.g. 'scaling'
  name_bn       text not null,
  name_en       text not null,
  duration_min  int  not null check (duration_min between 10 and 240),
  fee_bdt       int  not null check (fee_bdt >= 0),
  prep_notes_bn text,
  active        boolean not null default true,
  unique (clinic_id, code)
);

create table doctor_services (
  doctor_id  uuid not null references doctors(id)  on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (doctor_id, service_id)
);

-- Weekly chamber hours. weekday follows Postgres: 0 = Sunday ... 6 = Saturday.
create table doctor_schedules (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references doctors(id) on delete cascade,
  weekday       smallint not null check (weekday between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  slot_minutes  int  not null default 30,
  check (end_time > start_time)
);

-- ---------------------------------------------------------------------------
-- People and calls
-- ---------------------------------------------------------------------------
-- A phone number is NOT unique: families in Bangladesh often share one number,
-- so a patient is matched on phone + name.
create table patients (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  full_name_bn  text,
  full_name_en  text,
  phone_e164    text not null check (phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (full_name_bn is not null or full_name_en is not null)
);
create index patients_phone_idx on patients (clinic_id, phone_e164);

create table calls (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  patient_id    uuid references patients(id) on delete set null,
  livekit_room  text not null unique,
  channel       text not null default 'web',    -- 'web' today, 'phone' later
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  duration_s    int generated always as
                  (case when ended_at is null then null
                        else extract(epoch from ended_at - started_at)::int end) stored,
  status        call_status not null default 'live',
  outcome       call_outcome,
  end_reason    text,                            -- caller_hangup, time_limit, silence, error
  summary_bn    text,
  summary_en    text,
  flags         text[] not null default '{}',   -- spam, abusive, off_topic, medical_advice_request
  avg_latency_ms int,
  recording_url text,
  created_at    timestamptz not null default now()
);
create index calls_clinic_started_idx on calls (clinic_id, started_at desc);

create table transcript_turns (
  id            bigint generated always as identity primary key,
  call_id       uuid not null references calls(id) on delete cascade,
  seq           int  not null,
  speaker       speaker not null,
  text_bn       text not null,                   -- what was said (Bangla / mixed)
  text_en       text,                            -- English translation for staff
  offset_ms     int  not null,                   -- time since call start
  interrupted   boolean not null default false,  -- agent was cut off by the caller
  unique (call_id, seq)
);

-- One row per call, written after the call by a structured-output LLM pass
-- and validated before insert.
create table call_extractions (
  call_id               uuid primary key references calls(id) on delete cascade,
  intent                call_intent not null,
  patient_name_bn       text,
  patient_name_en       text,
  phone_e164            text check (phone_e164 is null or phone_e164 ~ '^\+8801[3-9][0-9]{8}$'),
  reason_for_visit      text,
  preferred_date_text   text,                    -- the caller's own words, e.g. "আগামী রবিবার বিকালে"
  preferred_datetime    timestamptz,             -- resolved in Asia/Dhaka
  outcome               call_outcome not null,
  needs_human           boolean not null default false,
  is_spam               boolean not null default false,
  sentiment             text check (sentiment in ('positive', 'neutral', 'negative')),
  confidence            numeric(3,2) check (confidence between 0 and 1),
  validation_errors     text[] not null default '{}',
  model                 text,
  raw                   jsonb,                   -- full model output, for auditing
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table appointments (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  patient_id    uuid not null references patients(id),
  doctor_id     uuid not null references doctors(id),
  service_id    uuid not null references services(id),
  call_id       uuid references calls(id) on delete set null,  -- the call that created it
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        appointment_status not null default 'scheduled',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  -- The database itself refuses two scheduled appointments that overlap for one doctor.
  constraint no_double_booking exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'scheduled')
);
create index appointments_patient_idx on appointments (patient_id);
create index appointments_doctor_time_idx on appointments (doctor_id, starts_at);

-- Full history: every booking, reschedule and cancellation, and which call did it.
create table appointment_events (
  id              bigint generated always as identity primary key,
  appointment_id  uuid not null references appointments(id) on delete cascade,
  call_id         uuid references calls(id) on delete set null,
  event           appointment_event not null,
  old_starts_at   timestamptz,
  new_starts_at   timestamptz,
  actor           actor not null,
  reason          text,
  created_at      timestamptz not null default now()
);

-- Requests the agent must not handle itself (medical questions, complaints, ...).
create table callbacks (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  call_id       uuid references calls(id) on delete set null,
  patient_id    uuid references patients(id) on delete set null,
  phone_e164    text,
  category      text not null check (category in ('medical_question', 'complaint', 'billing', 'emergency', 'other')),
  reason        text not null,
  status        callback_status not null default 'open',
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid
);

-- Every function call the agent made during a call: what it asked, what it got back.
create table tool_invocations (
  id            bigint generated always as identity primary key,
  call_id       uuid not null references calls(id) on delete cascade,
  tool_name     text not null,
  args          jsonb not null,
  result        jsonb not null,
  ok            boolean not null,
  duration_ms   int,
  created_at    timestamptz not null default now()
);

-- Portal users. user_id comes from Supabase Auth.
create table staff (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  full_name   text not null,
  role        staff_role not null default 'receptionist',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Accepts Bangla or English digits, spaces, dashes, +880 / 880 / 0 prefixes.
-- Returns +8801XXXXXXXXX, or null if it is not a valid Bangladeshi mobile number.
create function normalize_bd_phone(raw text) returns text
language sql immutable as $$
  with d as (
    select regexp_replace(translate(coalesce(raw, ''), '০১২৩৪৫৬৭৮৯', '0123456789'), '\D', '', 'g') as s
  )
  select case
    when s ~ '^8801[3-9][0-9]{8}$' then '+' || s
    when s ~ '^01[3-9][0-9]{8}$'   then '+88' || s
    when s ~ '^1[3-9][0-9]{8}$'    then '+880' || s
  end
  from d;
$$;

-- Free slots for one service on one local date. Respects chamber hours, the
-- service length, which doctors offer it, and existing scheduled appointments.
-- p_ignore_appt lets a reschedule ignore the appointment being moved.
create function available_slots(
  p_clinic       uuid,
  p_date         date,
  p_service_code text,
  p_doctor       uuid default null,
  p_ignore_appt  uuid default null
) returns table (doctor_id uuid, doctor_name_bn text, doctor_name_en text,
                 starts_at timestamptz, ends_at timestamptz)
language sql stable as $$
  with svc as (
    select s.id, s.duration_min from services s
    where s.clinic_id = p_clinic and s.code = p_service_code and s.active
  ),
  cand as (
    select d.id as doctor_id, d.full_name_bn, d.full_name_en,
           (gs.t at time zone c.timezone) as starts_at,
           (gs.t at time zone c.timezone) + make_interval(mins => svc.duration_min) as ends_at
    from clinics c
    join doctors d          on d.clinic_id = c.id and d.active
    join svc                on true
    join doctor_services ds on ds.doctor_id = d.id and ds.service_id = svc.id
    join doctor_schedules sc on sc.doctor_id = d.id and sc.weekday = extract(dow from p_date)::int
    cross join lateral generate_series(
      p_date + sc.start_time,
      p_date + sc.end_time - make_interval(mins => svc.duration_min),
      make_interval(mins => sc.slot_minutes)
    ) as gs(t)
    where c.id = p_clinic and (p_doctor is null or d.id = p_doctor)
  )
  select cand.doctor_id, cand.full_name_bn, cand.full_name_en, cand.starts_at, cand.ends_at
  from cand
  where cand.starts_at > now() + interval '30 minutes'
    and not exists (
      select 1 from appointments a
      where a.doctor_id = cand.doctor_id
        and a.status = 'scheduled'
        and (p_ignore_appt is null or a.id <> p_ignore_appt)
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(cand.starts_at, cand.ends_at)
    )
  order by cand.starts_at, cand.full_name_en;
$$;

-- ---------------------------------------------------------------------------
-- Booking functions used by the voice agent and the portal.
-- Each returns jsonb {ok: true, ...} or {ok: false, error: '<code>'} so the
-- agent can pass the result straight back to the LLM.
-- ---------------------------------------------------------------------------
create function book_appointment(
  p_clinic       uuid,
  p_call         uuid,
  p_name_bn      text,
  p_name_en      text,
  p_phone        text,
  p_service_code text,
  p_doctor       uuid,
  p_starts_at    timestamptz,
  p_notes        text default null
) returns jsonb
language plpgsql as $$
declare
  v_phone   text := normalize_bd_phone(p_phone);
  v_tz      text;
  v_svc     services;
  v_patient uuid;
  v_appt    appointments;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_phone');
  end if;
  if coalesce(trim(p_name_bn), '') = '' and coalesce(trim(p_name_en), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  select * into v_svc from services where clinic_id = p_clinic and code = p_service_code and active;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_service');
  end if;
  select timezone into v_tz from clinics where id = p_clinic;

  if not exists (
    select 1 from available_slots(p_clinic, (p_starts_at at time zone v_tz)::date, p_service_code, p_doctor) s
    where s.starts_at = p_starts_at
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  -- Same phone + same name = same patient; otherwise a new family member.
  select id into v_patient from patients
  where clinic_id = p_clinic and phone_e164 = v_phone
    and (full_name_bn = nullif(trim(p_name_bn), '') or lower(full_name_en) = lower(nullif(trim(p_name_en), '')))
  limit 1;
  if v_patient is null then
    insert into patients (clinic_id, full_name_bn, full_name_en, phone_e164)
    values (p_clinic, nullif(trim(p_name_bn), ''), nullif(trim(p_name_en), ''), v_phone)
    returning id into v_patient;
  end if;

  begin
    insert into appointments (clinic_id, patient_id, doctor_id, service_id, call_id, starts_at, ends_at, notes)
    values (p_clinic, v_patient, p_doctor, v_svc.id, p_call, p_starts_at,
            p_starts_at + make_interval(mins => v_svc.duration_min), p_notes)
    returning * into v_appt;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end;

  insert into appointment_events (appointment_id, call_id, event, new_starts_at, actor)
  values (v_appt.id, p_call, 'booked', p_starts_at, 'ai_agent');

  update calls set patient_id = v_patient where id = p_call and patient_id is null;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt.id, 'patient_id', v_patient,
                            'starts_at', v_appt.starts_at, 'ends_at', v_appt.ends_at,
                            'phone_e164', v_phone);
end;
$$;

-- Upcoming scheduled appointments for a phone number (used before reschedule/cancel).
create function find_appointments(p_clinic uuid, p_phone text) returns jsonb
language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'appointment_id', a.id,
           'patient_name_bn', p.full_name_bn, 'patient_name_en', p.full_name_en,
           'doctor_name_bn', d.full_name_bn,  'service_name_bn', s.name_bn,
           'service_code', s.code, 'doctor_id', d.id,
           'starts_at', a.starts_at) order by a.starts_at), '[]'::jsonb)
  from appointments a
  join patients p on p.id = a.patient_id
  join doctors  d on d.id = a.doctor_id
  join services s on s.id = a.service_id
  where a.clinic_id = p_clinic
    and p.phone_e164 = normalize_bd_phone(p_phone)
    and a.status = 'scheduled'
    and a.starts_at > now();
$$;

create function reschedule_appointment(
  p_appointment uuid,
  p_phone       text,
  p_new_start   timestamptz,
  p_call        uuid
) returns jsonb
language plpgsql as $$
declare
  v_appt appointments;
  v_code text;
  v_tz   text;
  v_old  timestamptz;
begin
  select a.* into v_appt from appointments a join patients p on p.id = a.patient_id
  where a.id = p_appointment and p.phone_e164 = normalize_bd_phone(p_phone) and a.status = 'scheduled'
  for update of a;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  end if;
  select s.code into v_code from services s where s.id = v_appt.service_id;
  select c.timezone into v_tz from clinics c where c.id = v_appt.clinic_id;

  if not exists (
    select 1 from available_slots(v_appt.clinic_id, (p_new_start at time zone v_tz)::date,
                                  v_code, v_appt.doctor_id, v_appt.id) s
    where s.starts_at = p_new_start
  ) then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  v_old := v_appt.starts_at;
  begin
    update appointments
    set starts_at = p_new_start,
        ends_at   = p_new_start + (v_appt.ends_at - v_appt.starts_at),
        updated_at = now()
    where id = v_appt.id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end;

  insert into appointment_events (appointment_id, call_id, event, old_starts_at, new_starts_at, actor)
  values (v_appt.id, p_call, 'rescheduled', v_old, p_new_start, 'ai_agent');
  update calls set patient_id = v_appt.patient_id where id = p_call and patient_id is null;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt.id,
                            'old_starts_at', v_old, 'new_starts_at', p_new_start);
end;
$$;

create function cancel_appointment(
  p_appointment uuid,
  p_phone       text,
  p_call        uuid,
  p_reason      text default null
) returns jsonb
language plpgsql as $$
declare
  v_appt appointments;
begin
  select a.* into v_appt from appointments a join patients p on p.id = a.patient_id
  where a.id = p_appointment and p.phone_e164 = normalize_bd_phone(p_phone) and a.status = 'scheduled'
  for update of a;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  end if;

  update appointments set status = 'cancelled', updated_at = now() where id = v_appt.id;
  insert into appointment_events (appointment_id, call_id, event, old_starts_at, actor, reason)
  values (v_appt.id, p_call, 'cancelled', v_appt.starts_at, 'ai_agent', p_reason);
  update calls set patient_id = v_appt.patient_id where id = p_call and patient_id is null;

  return jsonb_build_object('ok', true, 'appointment_id', v_appt.id, 'cancelled_starts_at', v_appt.starts_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal view: one row per call with the extracted fields, for the call list.
-- security_invoker makes the view obey the caller's row-level security.
-- ---------------------------------------------------------------------------
create view call_list with (security_invoker = true) as
select c.id, c.clinic_id, c.started_at, c.ended_at, c.duration_s, c.status,
       coalesce(c.outcome, e.outcome) as outcome, c.flags, c.summary_bn, c.summary_en,
       coalesce(p.full_name_bn, e.patient_name_bn) as caller_name_bn,
       coalesce(p.full_name_en, e.patient_name_en) as caller_name_en,
       coalesce(p.phone_e164, e.phone_e164)         as caller_phone,
       e.intent, e.reason_for_visit, e.preferred_datetime, e.needs_human, e.is_spam
from calls c
left join call_extractions e on e.call_id = c.id
left join patients p         on p.id = c.patient_id;

-- ---------------------------------------------------------------------------
-- Security
-- The agent connects as the database owner (server-side only, never exposed).
-- The portal signs staff in with Supabase Auth; RLS limits them to their clinic.
-- ---------------------------------------------------------------------------
create function current_staff_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select clinic_id from staff where user_id = auth.uid();
$$;

alter table clinics            enable row level security;
alter table doctors            enable row level security;
alter table services           enable row level security;
alter table doctor_services    enable row level security;
alter table doctor_schedules   enable row level security;
alter table patients           enable row level security;
alter table calls              enable row level security;
alter table transcript_turns   enable row level security;
alter table call_extractions   enable row level security;
alter table appointments       enable row level security;
alter table appointment_events enable row level security;
alter table callbacks          enable row level security;
alter table tool_invocations   enable row level security;
alter table staff              enable row level security;

create policy staff_read on clinics          for select to authenticated using (id = current_staff_clinic());
create policy staff_read on doctors          for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on services         for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on doctor_services  for select to authenticated
  using (exists (select 1 from doctors d where d.id = doctor_id and d.clinic_id = current_staff_clinic()));
create policy staff_read on doctor_schedules for select to authenticated
  using (exists (select 1 from doctors d where d.id = doctor_id and d.clinic_id = current_staff_clinic()));
create policy staff_read on patients         for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on calls            for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on transcript_turns for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and c.clinic_id = current_staff_clinic()));
create policy staff_read on call_extractions for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and c.clinic_id = current_staff_clinic()));
create policy staff_read on appointments     for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on appointment_events for select to authenticated
  using (exists (select 1 from appointments a where a.id = appointment_id and a.clinic_id = current_staff_clinic()));
create policy staff_read on callbacks        for select to authenticated using (clinic_id = current_staff_clinic());
create policy staff_read on tool_invocations for select to authenticated
  using (exists (select 1 from calls c where c.id = call_id and c.clinic_id = current_staff_clinic()));
create policy staff_read_self on staff       for select to authenticated using (user_id = auth.uid());

-- Staff can close callbacks from the portal.
create policy staff_resolve on callbacks for update to authenticated
  using (clinic_id = current_staff_clinic()) with check (clinic_id = current_staff_clinic());

-- Nothing is readable without signing in, and only the agent (owner) may call
-- the functions that change bookings.
revoke all on all tables in schema public from anon;
revoke execute on function book_appointment, reschedule_appointment, cancel_appointment,
                           find_appointments, available_slots
  from public, anon, authenticated;

-- Live updates in the portal when a call starts, ends or gets its extraction.
alter publication supabase_realtime add table calls, call_extractions, callbacks;
