-- Local console/test sessions reuse one room name, so a room is not a call.
-- Each call is identified by its own id; the LiveKit job id is stored for tracing.
alter table calls drop constraint calls_livekit_room_key;
alter table calls add column livekit_job_id text unique;
create index calls_room_idx on calls (livekit_room);
