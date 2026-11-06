# Guards and corner cases

Everything the system does to stay correct, safe and polite when callers (or the internet) don't behave as expected. Each item says **where** it is enforced, so it can be checked in the code.

Legend: **DB** = Postgres (`supabase/migrations`), **Agent** = `agent/src/*.py`, **Prompt** = `agent/src/prompt.py`, **Web** = `web/src`.

---

## 1. Booking correctness

| Case | What happens | Where |
|---|---|---|
| Two callers book the same doctor at the same time | Impossible: an `EXCLUDE` constraint rejects any overlapping *scheduled* appointment for a doctor, even under concurrent calls; the agent gets `slot_taken` and offers another time | DB `no_double_booking` |
| A booking longer than one slot (root canal or whitening, 60 min) | Slots start every 30 min, but a booking blocks the doctor for the service's full length: a 12:00 root canal blocks 12:00–13:00, so 12:30 is not offered, and an 11:30 root canal isn't offered either. A 12:00 check-up (20 min) or scaling (30 min) leaves 12:30 free. Per doctor only. The slot board greys every 30-min block the booking overlaps | DB `available_slots`, exclusion constraint, `/api/availability` |
| Caller picks a time that isn't a real slot (outside chamber hours, wrong length, already taken) | `book_appointment` re-checks `available_slots()` before inserting → `slot_unavailable` | DB |
| Caller asks for a time the agent didn't offer ("চারটায় হবে?") | The agent must call `check_availability` again with `preferred_time`; it may never say "খালি নেই" without checking | Prompt + Agent |
| Agent says "দেখছি" and then stops | Prompt requires the check in the same reply (fixed after a test showed silence) | Prompt |
| Caller names a doctor who doesn't do that service (root canal with Dr. Tanvir) | Each doctor's services are in the prompt; the agent says who does it ("রুট ক্যানেল ডা. নুসরাত জাহান করেন") | Prompt + DB `doctor_services` |
| "Is Dr. X in on Wednesday?" (a day they don't sit) | Each doctor's chamber days are in the prompt from `doctor_schedules`; the agent answers from that list, never by agreeing with the caller, and the slot check returns `doctor_not_in_that_day` with the days they do sit. Before the fix it said "থাকবেন" and later "no slots" (a real test call) | DB + Prompt + Agent `check_availability` |
| Service nobody offers on that day (root canal on a Monday: only Dr. Nusrat does it) | The slot check returns `no_doctor_for_service_that_day` with who does it and their days, so the agent says that instead of "no slots" | Agent `check_availability` |
| "৯ তারিখ কি বার?" heard as "৯ তারিখ কি 12" | Azure turns "বার" (weekday) into 12; after "… তারিখ কি" it is rewritten back to "বার" before the agent reads it, and the agent answers the weekday from its calendar | Agent `fix_weekday_question` + Prompt |
| Caller didn't name a doctor | Availability searches **all** doctors; a named doctor's slots are listed first | Agent `check_availability` |
| Friday | Clinic closed: the tool returns `closed_friday`, the prompt calendar marks it, the slot board shows "বন্ধ" | Agent + Prompt + Web |
| Past date ("গতকাল") | `date_in_past` → asks for another day | Agent |
| Malformed date from the model | `bad_date` returned, never sent to the DB | Agent |
| Relative dates ("আগামী রবিবার", "কাল সন্ধ্যায়", "পরশু") | An 8-day calendar (Bangla + English weekday) is in the prompt; part of day maps to morning/afternoon/evening | Prompt + Agent |
| Caller changes their mind mid-booking | Re-checks the new day; nothing is booked until the final confirmation | Prompt |
| Booking without a full summary | Step 6: read name, day, time, doctor, service back and ask "ঠিক আছে?"; book only after yes | Prompt |
| Agent claims "বুক হয়ে গেছে" before booking | Forbidden until the booking tool succeeds | Prompt |
| No name given | `name_required`; the prompt requires asking and confirming the full name | DB + Prompt |
| Reschedule / cancel someone else's appointment | Functions require the phone the appointment was booked with → `appointment_not_found` | DB |
| Cancelling | Cancels as soon as the caller confirms which appointment; never asks why (a test showed the model asking twice) | Tool description |
| Caller doesn't remember which number they booked with | Asks once for another number, then records a staff callback to match it up | Prompt |
| Cancel/reschedule when no appointment exists | `find_appointments` returns an empty list; the agent says so | DB + Agent |
| Moving an appointment to a day its doctor doesn't sit (found in a real call: Dr. Farhana, Saturday → Sunday) | The found booking is read back with its doctor and service; the slot check uses that booking's doctor, so the agent says "ডা. ফারহানা রবিবার বসেন না" and names who does sit that day. If the caller agrees to another doctor, the new slot is booked first and the old one cancelled after (never left with no booking). A failed move is diagnosed in code from the database (doctor doesn't sit that day, outside chamber hours, too soon, already booked, doesn't offer the service) and that real reason is what the agent says — before this, it told a caller "slots are filling up fast" when nobody had booked anything. It then re-checks instead of retrying slot after slot; after two failures it offers a staff callback | Agent `find_appointments`, `check_availability`, `reschedule_appointment` |
| Reschedule keeps the same service length and doctor; the old slot is freed | `reschedule_appointment` + exclusion constraint ignoring itself | DB |
| History is never lost | Every booking, reschedule and cancellation is written to `appointment_events` with old/new time and the call that did it | DB |
| Each booking/cancel is all-or-nothing | Postgres functions run in one transaction | DB |
| Booking for someone else ("আমার আম্মার জন্য", a child) | Asks for the **patient's** name ("আপনার আম্মার পুরো নামটা বলবেন?") and a contact number; who booked goes in the appointment notes | Prompt |
| Two people in one call | After the first booking, the time, name and confirmation steps run again for the second | Prompt |
| "সাতটায়" without morning/evening | Resolved from the clinic's hours (taken as সন্ধ্যা সাতটা in a test) | Prompt + calendar |
| "বিকেলে" offered noon slots | Parts of day use the same bands everywhere: সকাল <12, দুপুর 12–3, বিকাল 3–6, সন্ধ্যা/রাত 6+; if nothing is free then, the nearest times that day are offered and the caller is told | Agent `PARTS_OF_DAY` |
| Families share one phone (common in Bangladesh) | Patients are matched on phone **and** name, so a sibling gets their own record | DB `book_appointment` |
| Preparation before a visit | Root canal and extraction carry prep notes (e.g. bring old X-rays, don't come on an empty stomach), said after booking | DB seed + Prompt |

## 2. Phone numbers

| Case | What happens | Where |
|---|---|---|
| Number said in English, Bangla words, digits, or mixed ("জিরো ওয়ান", "শূন্য এক", "০১৭১২", "01712") | Converted to digits **in code**, not by the LLM | Agent `spoken_digits` |
| "double one", "triple five", "ডাবল", "ট্রিপল" | Expanded | Agent |
| Phone numbers said in Bangla, English or mixed ("জিরো ওয়ান সেভেন, ডাবল ওয়ান") | Azure `bn-BD` keeps the words; `spoken_digits()` turns them (and "double/triple") into digits; longer pauses while the number is being read out | `bangla.spoken_digits`, agent `phone_mode` |
| Names misheard as ordinary words ("মুখ ভুল হাসান") | Azure phrase list of common Bangladeshi names; the agent reads the name back and waits for a yes, guesses the closest common name when what it heard isn't a name, and after two failed corrections notes its best guess and the call gets a `name_unconfirmed` flag | `voice.build_stt`, `names.py`, prompt step 4, extraction |
| Number said in parts with pauses | Longer silence allowed while collecting the number (2–5 s instead of 0.8–3 s); parts are joined; "জি" between parts | Agent |
| Still incomplete after two parts | Reads back once what it has: "এখন পর্যন্ত পেয়েছি …" | Agent |
| Caller restarts the number ("01…") | Treated as a fresh attempt, never glued to earlier pieces | Agent |
| Doesn't start with 01 / +880 1 | Said as soon as it is heard: "বাংলাদেশের মোবাইল নম্বর শূন্য এক দিয়ে শুরু হয়…" | Agent |
| Invalid operator (012…) | "শূন্য এক-এর পরে তিন থেকে নয়ের মধ্যে কোনো অংক হয়…" | Agent |
| More than 11 digits | "নম্বরে এগারোটার বেশি অংক হয়ে গেছে…", starts over | Agent |
| Three wrong attempts | Stops asking and offers a staff callback (no loop) | Agent |
| Model invents a number | Tool and prompt forbid it; the number must come from this call | Prompt + tool description |
| Read back | Always digit by digit in Bangla, grouped 5-3-3 | Agent `say_phone` |
| Stored format | `normalize_bd_phone()` + CHECK constraint: only `+8801[3-9]XXXXXXXX` | DB |

## 3. Safety and scope

| Case | What happens | Where |
|---|---|---|
| Medicine / diagnosis questions | Politely declined ("ডাক্তারই বলতে পারবেন"), offers an appointment or callback | Prompt |
| Emergency (heavy bleeding, swelling, fever, breathing trouble) | Tells the caller to go to a hospital emergency now and records an `emergency` callback | Prompt + `request_callback` |
| Caller wants a human / the doctor / has a complaint or billing issue | "আমাদের টিম আপনাকে ফোন করবে", takes reason and number, records a callback for staff | Prompt + `callbacks` |
| Doctor's or staff's personal mobile, home address | Never given; offers an appointment, or a staff callback if urgent (tested) | Prompt |
| Off-topic (weather, cricket, politics, other businesses) | One polite sentence, back to the appointment; never answered | Prompt |
| "তুমি কে?" / "তুমি কি মানুষ?" | Honest: "আমি রাকিব ডেন্টাল কেয়ারের AI সহকারী…" | Prompt |
| Pranks or abuse | One polite warning, then goodbye and `end_call` | Prompt |
| Invented clinic information | Only facts in the prompt (from the DB) or from tools may be used | Prompt |
| Long calls | Hard limit of 5 minutes, then a polite goodbye | Agent `MAX_CALL_DURATION_SECONDS` |
| Hanging up the instant it says "আল্লাহ হাফেজ" | After the goodbye the line stays open 4 s: if the caller says anything the hang-up is cancelled and the agent answers; a plain "আল্লাহ হাফেজ"/"ধন্যবাদ" back ends it without another goodbye. Tested all three | Agent `end_call` + prompt |
| Browser left in an empty room after the agent hangs up | Every agent hang-up (goodbye, silence, time limit) closes the room straight away, so the page shows "call ended"; saving the summary runs afterwards | Agent `hang_up` |

## 4. Language and voice

| Case | What happens | Where |
|---|---|---|
| Sounding Kolkata | Bangladeshi-trained voices only (Azure `bn-BD` live, Cartesia as the alternative); Bangla prompt with Dhaka examples and a banned-word list | Prompt + voice config |
| Kolkata words slip through (জল, স্নান, নিমন্ত্রণ, জলখাবার, আজ্ঞে) | Replaced with Dhaka words just before speech; whole words only ("জলদি" untouched) | Agent `dhaka_words` |
| Caller greets with "নমস্কার" | The agent answers "নমস্কার" and says "ভালো থাকবেন" instead of "আল্লাহ হাফেজ" at the end; it never says নমস্কার on its own, and the opening greeting stays আসসালামু আলাইকুম | Prompt |
| Caller speaks English | Understands, always answers in Bangla, including the goodbye | Prompt |
| Second LLM goodbye in English after `end_call` | `end_call` produces no extra reply | Agent |
| "ডা." read as "da" | Spoken as "ডাক্তার" | Agent |
| Azure mispronounces "সাড়ে" | For Azure only: "সাড়ে পাঁচটা" → "পাঁচটা তিরিশে" | Agent `AzureBanglaTTS` |
| Times, dates, numbers | Generated in code ("বিকাল সাড়ে পাঁচটা", "দুপুর দেড়টা", "রবিবার, ৮ নভেম্বর"); the LLM copies them | Agent `bangla.py` |
| Codes/IDs spoken aloud | Forbidden (`service_code`, doctor codes stay internal) | Prompt |

## 5. Turn-taking and timing

| Case | What happens | Where |
|---|---|---|
| Caller pauses mid-sentence | Waits 0.8 s of silence (max 3 s) before answering | Agent session |
| Caller says "জি"/"হুঁ" while the agent talks | Not an interruption (needs ≥ 0.6 s and ≥ 2 words) | Agent session |
| Caller interrupts | Agent stops and listens; counted per call | LiveKit + Agent |
| Waiting on the database | Instant "জি, একটু দেখছি…" / "জি, বুক করছি…" — skipped if the agent just said something similar | Agent `_ack` |
| Slow replies | Reply drafting starts while the end of speech is confirmed (preemptive generation) | Agent session |
| Silence | After ~12 s: "হ্যালো, আপনি কি শুনতে পাচ্ছেন?"; then a polite hang-up | Agent `handle_silence` |
| Pauses sent as exact digital silence (synthetic test callers, some noise suppressors) | All-zero frames get inaudible ±1 noise before recognition; Azure missed the next sentence in 2 of 3 such calls without it, 0 of 3 with it. Cost 2 µs per 10 ms frame | Agent `dither_silence` |
| Recogniser goes quiet mid-call (no error, so no automatic fallback) | Watchdog: ≥1 s of speech heard by the voice detector, no text 2.5 s later → the Azure session is replaced (new one in ~0.1 s) and the caller is asked "দুঃখিত, আবার একটু বলবেন?" (max twice). Shown in the portal's Call quality box | Agent `restart_stalled_azure` + session events |
| Measuring all of this | Per-reply response time, end-of-speech wait, first LLM token, first audio, interruptions and models used are stored and shown in the portal | Agent `CallQuality` + DB `calls.quality` |

## 6. Reliability

| Case | What happens | Where |
|---|---|---|
| LLM down or rate-limited | Fallback chain: Gemma 4 → Groq gpt-oss-120b → Groq qwen | Agent `voice.py` |
| Speech recognition provider down | Azure → Deepgram (`STT_ORDER`, switchable without a code change) | Agent `voice.py` |
| Voice provider down or out of credit | Fallback between Cartesia and Azure, mid-call | Agent `voice.py` |
| A tool errors or hangs | 8 s timeout; a friendly Bangla message and an offer for staff to call back; never raises into the LLM | Agent `_run` |
| Every tool call | Logged with input, output, success and duration (`tool_invocations`) | Agent + DB |
| Post-call processing fails | Call marked `failed` instead of staying half-written | Agent `finish` |
| Agent process dies mid-call | Calls still "live" after 15 min are shown as failed, not "Live now" | DB view + Web |
| Agent never joins the browser call | 30 s timeout with a clear message | Web `CallWidget` |
| Hosted agent going to sleep | Deployed agent checked after a long idle period (wake test) | Ops |

## 7. Data quality after the call

| Case | What happens | Where |
|---|---|---|
| Model output doesn't fit the schema | Pydantic validation; failures recorded in `validation_errors`, never stored as facts | Agent `extraction.py` |
| Model uses variants ("book_appointment", "Booked", "inquiry", "callback needed") | Mapped to the allowed values instead of discarding the whole result | Agent |
| Model claims "booked" but nothing was booked | Outcome comes from what the tools actually did in the DB; the mismatch is recorded | Agent |
| Romanised name contains Bangla or junk | Dropped (`[A-Za-z .'-]` only) | Agent |
| Phone in the extraction is invalid | Dropped and recorded | Agent + DB |
| Preferred time can't be parsed | Dropped and recorded; the caller's own words are still kept | Agent |
| Caller said nothing | Stored as `incomplete` without an LLM call | Agent |
| Duplicate extraction | `on conflict do nothing` | DB |
| Time zones | Stored in UTC, shown in Asia/Dhaka everywhere | DB + Web |

## 8. Security and privacy

| Case | What happens | Where |
|---|---|---|
| Signed-out visitors reading data | Row-level security on every table; `anon` has no table access | DB |
| Staff seeing other clinics | Policies limit reads to `current_staff_clinic()` | DB |
| Portal users changing bookings or calling booking functions | No update policies except closing callbacks; `execute` on booking functions revoked from portal roles (tested: 0 rows / permission denied) | DB |
| Public slot board leaking patients | `/api/availability` returns only doctor, time and booked/free | Web |
| Someone spamming the call button | 20 calls/hour per visitor (enough for a team testing from one office network), stored in Postgres; IP kept only as a salted hash | Web `/api/call` |
| Tokens reused | 10-minute, room-scoped token; a new room per call (dispatch happens on room creation) | Web `/api/call` |
| Secrets | Never in git (`.env*` ignored, staged diffs scanned before every commit); agent secrets in LiveKit, web secrets in Vercel | Repo + hosting |
| Recordings | Not stored (privacy by default) | — |

## 9. Browser and UI

| Case | What happens | Where |
|---|---|---|
| Microphone blocked / missing | Clear Bangla/English message with how to allow it | Web `CallWidget` |
| Network error / rate-limited | Specific messages | Web |
| Browser blocks audio autoplay | "শব্দ চালু করুন" button | Web |
| Call states | Connecting → calling the receptionist → live (listening/thinking/speaking, captions) → ended | Web |
| Slow 3D load / no WebGL | Soft glow placeholder; the page works without the 3D | Web |
| Two 3D scenes at once | Byte only renders while its section is on screen | Web `LazyByte` |
| Phones | Mobile framing (head and shoulders), no horizontal overflow | Web |
| Slot board edge cases | Friday "বন্ধ", "এই দিনে চেম্বার নেই", "কোনো স্লট পাওয়া যাচ্ছে না"; booked slots disabled; every 30 s | Web `DoctorBoard` |
| A slot booked on a call still looks free | The agent signals each booking, reschedule or cancel (participant attribute `bv.slots`); the board reloads within ~0.2 s, mid-call. The slot API is not cached (`no-store`), so the reload sees the change | Agent `_run` + Web `CallWidget`, `DoctorBoard`, `/api/availability` |
| Receptionist frozen while the system works | While checking or booking (`bv.activity`), the avatar looks down as if at the schedule, held ~2 s (the database step itself takes ~0.15 s) | Agent `_run` + Web `AvatarBoy` |

## 10. How these were checked

- **Unit tests** (`agent/tests`, `uv run pytest`): spoken-number parsing, phone read-back, Bangla times/dates, word fixes, Azure and Cartesia rewrites, the "তারিখ কি বার" fix, silence dither (including its cost), extraction aliases and name validation.
- **Database tests** (run inside a rolled-back transaction): phone normalisation, slots, double booking (including a forced overlapping insert), invalid phone, family members, find by Bangla-digit phone, reschedule frees the old slot, cancel with the wrong phone, event history.
- **Conversation sweep** (17 scripted calls through `lk agent debugger`): evening/relative dates, Friday, past date, wrong doctor for a service, fees and hours, address and payment, parking, emergency, medicine, off-topic, prank, English caller, human request, cancel with no booking, reschedule, code-switching, changing mind. Four failures were found and fixed (announce-without-checking, doctor/service mapping, parking, human handover).
- **RLS checks** run as the reviewer and as an anonymous user.
- **Live voice calls** for turn-taking, interruptions and latency.

## Known gaps

- Rare names can still be misspelt (e.g. সুমাইয়া); the read-back catches it, and after two failed corrections the call is flagged `name_unconfirmed`.
- Azure's free tier is 5 h of recognition a month; after that Deepgram takes over.
- About 2 s per reply on free models.
- Lip movement follows "agent is speaking" and audio level, not phonemes.
- No SMS confirmation, clinic-software integration or multi-clinic onboarding.
