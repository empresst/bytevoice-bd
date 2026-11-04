-- Portal live updates also for transcript lines (live call view) and appointments.
alter publication supabase_realtime add table transcript_turns, appointments, appointment_events;
