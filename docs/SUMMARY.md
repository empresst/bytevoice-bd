# What was built (short)

**Landing page** — Next.js on Vercel (Mumbai). 3D VRM receptionist with headset (lip movement while the agent talks, smile, blink, wave, cursor-follow), Dhaka dusk skyline, Bangla/English toggle, live "Our doctors" slot board (free/booked, pick a slot → start a call), features, use cases, pricing in taka, demo form, smaller 3D Byte mascot.

**Browser call** — "Talk to our Bangla caller": rate-limited token route, fresh LiveKit room per call, connecting/live/ended states, captions, clear mic/network/timeout errors.

**Bangla voice agent** — LiveKit Agents in the cloud (Mumbai). Deepgram Bangla speech-to-text (English for phone numbers), Gemma 4 LLM with Groq fallback, Cartesia/Azure Bangladeshi voices with fallback. Books, reschedules and cancels real appointments; confirms name, phone (digit by digit) and the full booking first; declines medical advice; handles emergencies, off-topic questions, pranks, silence and interruptions; hands over to staff via callbacks.

**Database** — Supabase Postgres (Mumbai): 14 tables, booking functions, no-double-booking constraint, Bangladeshi phone validation, full appointment history, row-level security.

**After each call** — transcript (Bangla + English), validated structured extraction (intent, patient, phone, reason, preferred time, outcome, flags, summary), measured response times.

**Portal** — login, dashboard, searchable/filterable calls, call detail (fields, transcript, AI actions, call quality), appointments, callbacks, patients, data-model page, live updates.

**Quality** — 10 unit tests, database tests, a 17-scenario conversation sweep (4 bugs found and fixed), linters clean, no secrets in git.

Details: [README](../README.md) · every guard: [GUARDS.md](GUARDS.md) · credits: [CREDITS.md](CREDITS.md)
