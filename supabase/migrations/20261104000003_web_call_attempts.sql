-- Rate limiting for the public "Talk to our Bangla caller" button.
-- Stores a salted hash of the visitor's IP, never the IP itself.
create table web_call_attempts (
  id          bigint generated always as identity primary key,
  ip_hash     text not null,
  room        text not null,
  created_at  timestamptz not null default now()
);
create index web_call_attempts_ip_time_idx on web_call_attempts (ip_hash, created_at desc);
alter table web_call_attempts enable row level security;  -- server-only; no policies
