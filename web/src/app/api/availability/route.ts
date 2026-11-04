import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Public, read-only view of the demo clinic: doctors, services, chamber hours and
// the next 7 days of 30-minute slots marked free or booked. No patient data leaves
// the server: only doctor, time and a booked flag.

const CLINIC_ID = process.env.CLINIC_ID ?? "0b7e5c3a-1d2f-4a6b-9c8d-000000000001";

export const dynamic = "force-dynamic";

export async function GET() {
  const [doctors, services, hours, slots] = await Promise.all([
    sql`select id, full_name_bn, full_name_en, specialty_bn, specialty_en
        from doctors where clinic_id = ${CLINIC_ID} and active order by full_name_en`,
    sql`select ds.doctor_id, s.code, s.name_bn, s.name_en, s.fee_bdt
        from doctor_services ds join services s on s.id = ds.service_id
        where s.clinic_id = ${CLINIC_ID} and s.active order by s.fee_bdt`,
    sql`select doctor_id, weekday, to_char(start_time, 'HH24:MI') as start, to_char(end_time, 'HH24:MI') as end
        from doctor_schedules order by weekday, start_time`,
    sql`
      with days as (
        select ((now() at time zone 'Asia/Dhaka')::date + i) as d from generate_series(0, 7) as i
      ),
      candidates as (
        select d.id as doctor_id, (gs.t at time zone 'Asia/Dhaka') as starts_at, sc.slot_minutes
        from doctors d
        join doctor_schedules sc on sc.doctor_id = d.id
        join days on extract(dow from days.d)::int = sc.weekday
        cross join lateral generate_series(
          days.d + sc.start_time,
          days.d + sc.end_time - make_interval(mins => sc.slot_minutes),
          make_interval(mins => sc.slot_minutes)
        ) as gs(t)
        where d.clinic_id = ${CLINIC_ID} and d.active
      )
      select c.doctor_id, c.starts_at,
             exists (
               select 1 from appointments a
               where a.doctor_id = c.doctor_id and a.status = 'scheduled'
                 and tstzrange(a.starts_at, a.ends_at) && tstzrange(c.starts_at, c.starts_at + make_interval(mins => c.slot_minutes))
             ) as booked
      from candidates c
      where c.starts_at > now() + interval '30 minutes'
      order by c.starts_at`,
  ]);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
  const body = {
    today,
    doctors: doctors.map((d) => ({
      id: d.id,
      code: String(d.full_name_en).split(" ")[1].toLowerCase(),
      name_bn: d.full_name_bn,
      name_en: d.full_name_en,
      specialty_bn: d.specialty_bn,
      specialty_en: d.specialty_en,
      services: services.filter((s) => s.doctor_id === d.id).map(({ code, name_bn, name_en, fee_bdt }) => ({ code, name_bn, name_en, fee_bdt })),
      hours: hours.filter((h) => h.doctor_id === d.id).map(({ weekday, start, end }) => ({ weekday, start, end })),
    })),
    slots: slots.map((s) => ({ doctor_id: s.doctor_id, starts_at: (s.starts_at as Date).toISOString(), booked: s.booked })),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } });
}
