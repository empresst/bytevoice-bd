"""Speech-to-text, LLM and text-to-speech providers, each with a fallback chain.

The voice order comes from TTS_ORDER, e.g. "cartesia,elevenlabs,azure".
If the first voice errors or runs out of credit mid-call, LiveKit's
FallbackAdapter moves to the next one, so the caller never hears silence.
"""

from __future__ import annotations

import logging
import os

import numpy as np
from livekit import rtc
from livekit.agents import APIConnectOptions, inference, llm, stt, tts
from livekit.agents.tts import ChunkedStream
from livekit.plugins import azure, cartesia, deepgram, elevenlabs, groq

from bangla import azure_pronunciation, cartesia_pronunciation
from names import COMMON_NAMES

logger = logging.getLogger("agent.voice")
DEFAULT_CONN_OPTIONS = APIConnectOptions()

# Words the recogniser should listen out for (doctor names, services, local terms).
KEYTERMS = [
    "appointment", "scaling", "root canal", "filling", "braces", "check-up",
    "তানভীর", "ফারহানা", "নুসরাত", "রাকিব", "ধানমন্ডি", "বিকাশ",
]


def build_stt() -> tuple[stt.STT, azure.STT | None]:
    """Azure bn-BD first, Deepgram as the fallback. Also returns the Azure
    instance (if used) so the agent can restart its session when it stalls.

    On the same 50 synthetic name clips Azure got 44 names exactly right and
    Deepgram 38; with the common-names phrase list Azure got 48. Deepgram's
    misses were often names split into ordinary words ("ফেরদৌস" -> "ফের দোষ").
    Azure bn-BD also handles phone numbers spoken in Bangla, English or mixed,
    so the language never has to change mid-call.
    """
    makers = {
        "azure": lambda: azure.STT(
            language="bn-BD",
            phrase_list=KEYTERMS + COMMON_NAMES,
            segmentation_silence_timeout_ms=500,
        ),
        "deepgram": lambda: deepgram.STT(
            model="nova-3",
            language="bn",
            interim_results=True,
            punctuate=True,
            smart_format=True,
            endpointing_ms=300,
            keyterm=KEYTERMS,
        ),
    }
    order = [n.strip() for n in os.getenv("STT_ORDER", "azure,deepgram").split(",") if n.strip() in makers]
    logger.info("speech-to-text order: %s", order)
    instances = {n: makers[n]() for n in order}
    return stt.FallbackAdapter(list(instances.values())), instances.get("azure")


def restart_stalled_azure(azure_stt: azure.STT | None) -> bool:
    """Replace a stalled Azure recognition session with a fresh one.

    A stall isn't an error, so the FallbackAdapter never reacts, and the plugin's
    own reconnect (update_options) hangs: it waits for Azure to confirm the old
    session stopped, which a stalled session never does (seen in tests).
    Marking the session stopped makes the stream raise; its built-in retry opens
    a new Azure session within ~0.1 s on the same live audio (tested: the next
    sentence was recognised each time). If Azure keeps failing, the retries run
    out and the FallbackAdapter moves the call to Deepgram.
    Uses the plugin's private fields (livekit-plugins-azure 1.8.x, pinned in uv.lock).
    """
    stopped = False
    for stream in list(getattr(azure_stt, "_streams", None) or []):
        event = getattr(stream, "_session_stopped_event", None)
        if event is not None:
            event.set()
            stopped = True
    return stopped


_DITHER: dict[int, bytes] = {}


def dither_silence(frame: rtc.AudioFrame) -> rtc.AudioFrame:
    """Replace an all-zero frame with inaudible noise (±1 of 32768).

    In tests Azure missed the caller's next sentence 2 times in 3 when the
    pauses were exact digital silence (what synthetic test callers and some
    noise suppressors send), and 0 in 3 with faint noise, like a real mic.
    Frames with any sound are passed through untouched.
    """
    samples = np.frombuffer(frame.data, dtype=np.int16)
    if samples.any() or os.getenv("STT_DITHER", "1") == "0":  # STT_DITHER=0 only for testing the watchdog
        return frame
    noise = _DITHER.get(len(samples))
    if noise is None:
        noise = _DITHER[len(samples)] = np.random.default_rng(0).integers(-1, 2, len(samples), dtype=np.int16).tobytes()
    return rtc.AudioFrame(noise, frame.sample_rate, frame.num_channels, frame.samples_per_channel)


def build_llm() -> llm.LLM:
    """Gemma 4 on LiveKit Inference first (paid from the LiveKit project's free
    monthly credit, no per-minute token cap), then Groq's free models if that
    credit runs out or the call fails."""
    chain: list[llm.LLM] = [
        inference.LLM(model=os.getenv("LLM_MODEL", "google/gemma-4-31b-it"),
                      extra_kwargs={"temperature": 0.3, "max_completion_tokens": 300}),
        groq.LLM(model="openai/gpt-oss-120b", temperature=0.3, reasoning_effort="low", max_completion_tokens=400),
        groq.LLM(model="qwen/qwen3.8-27b", temperature=0.3, reasoning_effort="none", max_completion_tokens=400),
    ]
    return llm.FallbackAdapter(chain, attempt_timeout=6.0)


class AzureBanglaTTS(tts.TTS):
    """Azure bn-BD with Bangla pronunciation fixes applied to the text first."""

    def __init__(self, voice: str) -> None:
        self._inner = azure.TTS(
            voice=voice,
            language="bn-BD",
            speech_key=os.environ["AZURE_SPEECH_KEY"],
            speech_region=os.environ["AZURE_SPEECH_REGION"],
        )
        super().__init__(
            capabilities=self._inner.capabilities,
            sample_rate=self._inner.sample_rate,
            num_channels=self._inner.num_channels,
        )

    @property
    def model(self) -> str:
        return "azure-bn-BD"

    @property
    def provider(self) -> str:
        return "azure"

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_CONN_OPTIONS) -> ChunkedStream:
        return self._inner.synthesize(azure_pronunciation(text), conn_options=conn_options)

    async def aclose(self) -> None:
        await self._inner.aclose()


class CartesiaBanglaTTS(tts.TTS):
    """Cartesia fed whole sentences (not word pieces as the LLM writes them, which made
    it stutter on "appointment-টা"), with Bangla-script fixes applied first."""

    def __init__(self, inner: cartesia.TTS) -> None:
        self._inner = inner
        super().__init__(capabilities=tts.TTSCapabilities(streaming=False),
                         sample_rate=inner.sample_rate, num_channels=inner.num_channels)

    @property
    def model(self) -> str:
        return self._inner.model

    @property
    def provider(self) -> str:
        return "cartesia"

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_CONN_OPTIONS) -> ChunkedStream:
        return self._inner.synthesize(cartesia_pronunciation(text), conn_options=conn_options)

    async def aclose(self) -> None:
        await self._inner.aclose()


def _make_tts(name: str) -> tts.TTS | None:
    try:
        if name == "cartesia":
            return CartesiaBanglaTTS(cartesia.TTS(
                model=os.getenv("CARTESIA_MODEL", "sonic-3"),
                voice=os.environ["CARTESIA_VOICE_ID"],
                language="bn",
                word_timestamps=False,  # only supported for a few languages
            ))
        if name == "elevenlabs":
            return elevenlabs.TTS(
                model=os.getenv("ELEVENLABS_MODEL", "eleven_v3_conversational"),
                voice_id=os.environ["ELEVENLABS_VOICE_ID"],
                language="bn",
            )
        if name == "azure":
            return AzureBanglaTTS(os.getenv("AZURE_VOICE", "bn-BD-PradeepNeural"))
    except KeyError as missing:
        logger.warning("Skipping %s voice: %s is not set", name, missing)
        return None
    raise ValueError(f"unknown TTS provider {name!r}")


def build_tts() -> tts.TTS:
    order = [n.strip() for n in os.getenv("TTS_ORDER", "cartesia,elevenlabs,azure").split(",") if n.strip()]
    chain = [t for t in (_make_tts(n) for n in order) if t is not None]
    if not chain:
        raise RuntimeError("No TTS provider configured; set at least AZURE_SPEECH_KEY")
    logger.info("TTS chain: %s", " -> ".join(t.provider for t in chain))
    return chain[0] if len(chain) == 1 else tts.FallbackAdapter(chain, max_retry_per_tts=1)
