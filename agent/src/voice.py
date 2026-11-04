"""Speech-to-text, LLM and text-to-speech providers, each with a fallback chain.

The voice order comes from TTS_ORDER, e.g. "cartesia,elevenlabs,azure".
If the first voice errors or runs out of credit mid-call, LiveKit's
FallbackAdapter moves to the next one, so the caller never hears silence.
"""

from __future__ import annotations

import logging
import os

from livekit.agents import APIConnectOptions, inference, llm, tts
from livekit.agents.tts import ChunkedStream
from livekit.plugins import azure, cartesia, deepgram, elevenlabs, groq

from bangla import azure_pronunciation

logger = logging.getLogger("agent.voice")

# Words Deepgram should listen out for (doctor names, services, local terms).
KEYTERMS = [
    "appointment", "scaling", "root canal", "filling", "braces", "check-up",
    "তানভীর", "ফারহানা", "নুসরাত", "রাকিব", "ধানমন্ডি", "বিকাশ",
]


def build_stt() -> deepgram.STT:
    return deepgram.STT(
        model="nova-3",
        language="bn",
        interim_results=True,
        punctuate=True,
        smart_format=True,
        endpointing_ms=300,
        keyterm=KEYTERMS,
    )


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

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = APIConnectOptions()
    ) -> ChunkedStream:
        return self._inner.synthesize(azure_pronunciation(text), conn_options=conn_options)

    async def aclose(self) -> None:
        await self._inner.aclose()


def _make_tts(name: str) -> tts.TTS | None:
    try:
        if name == "cartesia":
            return cartesia.TTS(
                model=os.getenv("CARTESIA_MODEL", "sonic-3"),
                voice=os.environ["CARTESIA_VOICE_ID"],
                language="bn",
                word_timestamps=False,  # only supported for a few languages
            )
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
