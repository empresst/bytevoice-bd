"""Tests for the audio dither applied before speech recognition."""

import sys
import time
from pathlib import Path

import numpy as np
from livekit import rtc

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from voice import dither_silence


def frame(samples: np.ndarray) -> rtc.AudioFrame:
    return rtc.AudioFrame(samples.astype(np.int16).tobytes(), 48000, 1, len(samples))


def test_exact_silence_gets_inaudible_noise():
    out = dither_silence(frame(np.zeros(480)))
    s = np.frombuffer(out.data, dtype=np.int16)
    assert s.any(), "all-zero frame must not stay all-zero"
    assert np.abs(s).max() <= 1, "noise must stay at ±1 (inaudible)"
    assert (out.sample_rate, out.num_channels, out.samples_per_channel) == (48000, 1, 480)


def test_frames_with_sound_are_untouched():
    f = frame(np.array([0, 3, -2] * 160))
    assert dither_silence(f) is f


def test_dither_is_cheap():
    silent, speech = frame(np.zeros(480)), frame(np.full(480, 100))
    start = time.perf_counter()
    for _ in range(1000):  # 1000 frames = 10 s of audio
        dither_silence(silent)
        dither_silence(speech)
    per_frame_us = (time.perf_counter() - start) / 2000 * 1e6
    assert per_frame_us < 100, f"{per_frame_us:.1f} µs per 10 ms frame"
