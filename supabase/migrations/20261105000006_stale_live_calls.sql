-- A call whose agent process died never gets an "ended" update. Show such calls
-- as failed instead of "live" once they are clearly over (no call lasts > 15 min).
create or replace view call_list with (security_invoker = true) as
select c.id, c.clinic_id, c.started_at, c.ended_at, c.duration_s,
       case when c.status = 'live' and c.started_at < now() - interval '15 minutes' then 'failed'::call_status else c.status end as status,
       coalesce(c.outcome, e.outcome, case when c.status = 'live' and c.started_at < now() - interval '15 minutes' then 'failed'::call_outcome end) as outcome,
       c.flags, c.summary_bn, c.summary_en,
       coalesce(p.full_name_bn, e.patient_name_bn) as caller_name_bn,
       coalesce(p.full_name_en, e.patient_name_en) as caller_name_en,
       coalesce(p.phone_e164, e.phone_e164)         as caller_phone,
       e.intent, e.reason_for_visit, e.preferred_datetime, e.needs_human, e.is_spam
from calls c
left join call_extractions e on e.call_id = c.id
left join patients p         on p.id = c.patient_id;
