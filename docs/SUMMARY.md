# What was built (short)

**Landing page** — Next.js on Vercel (Mumbai). 3D VRM receptionist with headset (lip movement while the agent talks, smile, blink, wave, cursor-follow, and she looks down "at the schedule" while the agent checks or books), Dhaka dusk skyline, Bangla/English toggle, live "Our doctors" slot board (free/booked, pick a slot → start a call; a slot booked on a call turns grey during the call), features, use cases, pricing in taka, demo form, smaller 3D Byte mascot.

**Browser call** — "Talk to our Bangla caller": rate-limited token route (20 calls/hour per visitor), fresh LiveKit room per call, connecting/live/ended states, captions, clear mic/network/timeout errors.

**Bangla voice agent** — LiveKit Agents in the cloud (Mumbai).
- Speech-to-text: Azure `bn-BD` with a list of ~200 common Bangladeshi names (Deepgram fallback, switchable with `STT_ORDER`). Chosen after a side-by-side test: 48/50 names right vs Deepgram's 38.
- Safeguards: inaudible noise on exact-silence audio (Azure otherwise sometimes missed the next sentence) and a watchdog that replaces a stalled recognition session and asks the caller to repeat.
- LLM: Gemma 4 with Groq fallback. Voices: Azure/Cartesia Bangladeshi voices with fallback.
- Books, reschedules and cancels real appointments; reads the name back and waits for a yes (guesses the nearest common name if it heard ordinary words); phone digit by digit; full summary before booking.
- Knows each doctor's chamber days; books for someone else ("আমার আম্মার জন্য"); handles a forgotten booking number with a staff callback; never gives a doctor's private number or address; declines medical advice; handles emergencies, off-topic questions, pranks, silence and interruptions.
- After "আল্লাহ হাফেজ" the line stays open 4 s: if the caller says anything the conversation carries on.

**Database** — Supabase Postgres (Mumbai): 14 tables, booking functions, no-double-booking constraint, Bangladeshi phone validation, full appointment history, row-level security.

**After each call** — transcript (Bangla + English), validated structured extraction (intent, patient, phone, reason, preferred time, outcome, flags incl. `name_unconfirmed`, summary), measured response times, recognition restarts.

**Portal** — login, dashboard, searchable/filterable calls, call detail (fields, transcript, AI actions, call quality), appointments, callbacks, patients, data-model page, live updates.

**Quality** — 16 unit tests, database tests, scripted live-audio test calls against the deployed agent for every flow, linters clean, no secrets in git.

Details: [README](../README.md) · decisions and how they were checked: [DECISIONS.md](DECISIONS.md) · every guard: [GUARDS.md](GUARDS.md) · credits: [CREDITS.md](CREDITS.md)
