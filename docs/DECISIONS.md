# Decisions and how I checked them

I built this with Claude Code as a pair programmer. My rule was: nothing goes in on a suggestion alone. Every choice below was either tested side by side, heard with my own ears, or tried on a real call before it stayed. Where a test proved me or the AI wrong, the plan changed.

## Choices

| Decision | What I tried / why | Evidence |
|---|---|---|
| **Free stack only** | The brief says free tools are enough; I kept it that way, and rejected paid speech-to-text (Soniox, Sarvam) even though a public Bangla benchmark ranks them first | Benchmark (riverbornai, Sept 2026): Soniox 7.4 % CER streaming vs Deepgram 17.5 % |
| **Azure `bn-BD` for speech-to-text, Deepgram as fallback** | Names were the weak spot ("মকবুল হাসান" came out as "মুখ ভুল হাসান"). Instead of switching the LLM, I asked where the error came from: it was the recogniser, not the model | 50 name clips: Deepgram 38, Azure 44, Azure + Bangladeshi-name list 48. Then my own calls on a real microphone |
| **No language switch for phone numbers** | The old setup switched to Indian English while the caller read the number. Azure `bn-BD` plus our digit parser handled Bangla, English and mixed numbers | 4 number styles × 2 voices, all correct |
| **Keep English loanwords as they are in speech** | We tried writing "appointment" in Bangla script for the voice; I listened to both and the Bangla spelling sounded worse, so it was reverted | Side-by-side audio samples |
| **Call limit 20/hour, not 5** | Reviewers testing from one office share one IP address | — |

## Provider evidence (moved from the README)

- **Speech-to-text:** in a real call Deepgram heard "মকবুল হাসান" as "মুখ ভুল হাসান". On 50 synthetic clips (25 Bangladeshi names × 2 voices, "আমার নাম …") Azure got 44 names exactly right, Deepgram 38, and Azure with the name list 48; Deepgram's misses were often names split into ordinary words ("ফেরদৌস" → "ফের দোষ"). Azure `bn-BD` also got all four phone-number styles right, so recognition no longer switches language for the number. Safeguards: exact-silence audio gets inaudible noise, and a watchdog replaces a stalled session; normal replies measured 2.26 s median after the switch vs 2.38 s before.
- **LLM:** Groq's free tier allows 8,000 tokens/minute per model and a Bangla prompt is ~2,800 tokens per request, so calls stalled on rate limits; Gemma 4 via LiveKit Inference has no per-minute cap and gave the most natural Bangla of the free models tried. Gemini's free tier was too limited; Cerebras/Mistral free tiers allow only a few requests a minute.
- **Voice:** Azure's `bn-BD` voices are trained on Bangladeshi speech (Google offers only `bn-IN`); Cartesia "Kian" sounded the most natural in a side-by-side test but its free plan is ~20 minutes a month, so it is the fallback in the live demo. ElevenLabs' Bangladeshi voices are paid-only. Cartesia gets whole sentences (piece-by-piece text made it stutter on "appointment-টা").

## Problems I found by testing, and what changed

| What I noticed | Root cause | Fix |
|---|---|---|
| Booked slots stayed white on the website | The slot API was cached at the CDN, and the board only refreshed after the call | Agent signals each booking change; board reloads mid-call; API not cached |
| The receptionist hung up the instant it said "আল্লাহ হাফেজ" | Stock end-call tool | Line stays open 4 s; caller speaking cancels the hang-up |
| After that change, a call was cut before the booking confirmation | The AI booked and ended in one step; the timer started in the gap before it spoke | Timer restarts whenever the agent speaks; tested on the deployed agent |
| "বিকেলে" got noon slots | Two different definitions of "afternoon" in the code | One set of Bangla time-of-day bands everywhere |
| Agent said a doctor was in on Wednesday, then found no slots | The prompt had no chamber days, so the model agreed with the caller | Chamber days loaded from the database; the slot check says "doesn't sit that day" |
| Cancelling asked "why?" twice | The model's own habit | Tool description: never ask for a reason |
| Avatar didn't look down on my phone | The check takes ~0.15 s, and a fast "checking → done" pair can arrive as one update | Numbered signal, pose timed on the website |

The AI's own proposals were checked the same way. Three examples:
- A synthetic test made Azure drop sentences, so the first plan was to switch back to Deepgram. Repeating the test with faint background noise showed it was the test's digital silence; Azure stayed, with a safeguard.
- A "restart the recognition session" fix looked fine in code but hung in a test; it was replaced.
- A hang-up timing bug only showed in the cloud logs after deploy; it was fixed and re-tested there.

## How things were checked

- **Scripted live-audio calls**: synthetic Bangla callers (Azure voices) joining a real LiveKit room, run against both the local and the deployed agent, for booking, cancelling, rescheduling, names, numbers, off-topic questions, goodbyes and recognition stalls.
- **My own calls**, on laptop and phone, on the live site.
- **Logs after every deploy** (LiveKit Cloud), not just "it answered".
- **Measured latency before and after** each change, from the per-turn timings stored with every call: normal replies 2.26 s median after the speech-to-text switch vs 2.38 s before.
- **Free-tier budgets** worked out for a review of ~25 calls: every provider stays well inside its free limits.
