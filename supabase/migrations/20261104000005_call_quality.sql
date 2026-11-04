-- Measured call quality, from LiveKit's per-turn timings.
-- transcript_turns.response_ms: for an agent line, caller stopped speaking -> agent started speaking.
-- calls.quality: per-call summary (averages, slowest turn, interruptions, which models answered).
alter table transcript_turns add column response_ms int;
alter table calls add column quality jsonb;
-- the call_list view selects explicit columns, so nothing else changes
