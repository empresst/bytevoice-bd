"""Turn dates, times and phone numbers into words a Bangla voice reads correctly.

The LLM is given these ready-made phrases by the tools, so it never has to
format a time or read digits itself.
"""

from __future__ import annotations

import re
from datetime import datetime

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
DIGIT_WORDS = ["শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়"]
HOUR_WORDS = {
    1: "একটা", 2: "দুইটা", 3: "তিনটা", 4: "চারটা", 5: "পাঁচটা", 6: "ছয়টা",
    7: "সাতটা", 8: "আটটা", 9: "নয়টা", 10: "দশটা", 11: "এগারোটা", 12: "বারোটা",
}
WEEKDAYS = ["সোমবার", "মঙ্গলবার", "বুধবার", "বৃহস্পতিবার", "শুক্রবার", "শনিবার", "রবিবার"]  # Python weekday()
MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
          "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]


def part_of_day(hour: int) -> str:
    if hour < 12:
        return "সকাল"
    if hour < 15:
        return "দুপুর"
    if hour < 18:
        return "বিকাল"
    if hour < 20:
        return "সন্ধ্যা"
    return "রাত"


def say_time(dt: datetime) -> str:
    """17:30 -> 'বিকাল সাড়ে পাঁচটা', 13:30 -> 'দুপুর দেড়টা'."""
    h12 = dt.hour % 12 or 12
    prefix = part_of_day(dt.hour)
    if dt.minute == 0:
        return f"{prefix} {HOUR_WORDS[h12]}"
    if dt.minute == 30:
        if h12 == 1:
            return f"{prefix} দেড়টা"
        if h12 == 2:
            return f"{prefix} আড়াইটা"
        return f"{prefix} সাড়ে {HOUR_WORDS[h12]}"
    if dt.minute == 15:
        return f"{prefix} সোয়া {HOUR_WORDS[h12]}"
    if dt.minute == 45:
        return f"{prefix} পৌনে {HOUR_WORDS[h12 % 12 + 1]}"
    return f"{prefix} {HOUR_WORDS[h12]} {str(dt.minute).translate(BN_DIGITS)} মিনিট"


def say_date(dt: datetime) -> str:
    """2026-11-08 -> 'রবিবার, ৮ নভেম্বর'."""
    return f"{WEEKDAYS[dt.weekday()]}, {str(dt.day).translate(BN_DIGITS)} {MONTHS[dt.month - 1]}"


def say_datetime(dt: datetime) -> str:
    return f"{say_date(dt)}, {say_time(dt)}"


def say_phone(e164: str) -> str:
    """+8801712345678 -> 'শূন্য এক সাত এক দুই, তিন চার পাঁচ, ছয় সাত আট'."""
    local = "0" + e164.removeprefix("+880")
    groups = [local[:5], local[5:8], local[8:]]
    return ", ".join(" ".join(DIGIT_WORDS[int(d)] for d in g) for g in groups)


# ---------------------------------------------------------------------------
# Text fixes applied just before speech
# ---------------------------------------------------------------------------

# Kolkata / West Bengal words -> what a Dhaka receptionist would say.
# Only unambiguous swaps; the prompt does the real work, this is a safety net.
DHAKA_WORDS = {
    "নমস্কার": "আসসালামু আলাইকুম",
    "জল": "পানি",
    "স্নান": "গোসল",
    "নিমন্ত্রণ": "দাওয়াত",
    "জলখাবার": "নাস্তা",
    "আজ্ঞে": "জি",
}
_DHAKA_RE = re.compile(r"(?<![ঀ-৿])(" + "|".join(map(re.escape, DHAKA_WORDS)) + r")(?![ঀ-৿])")


# Abbreviations a voice would read letter by letter ("ডা." -> "ডা").
_ABBREV_RE = re.compile(r"ডা\.\s*")


def dhaka_words(text: str) -> str:
    text = _ABBREV_RE.sub("ডাক্তার ", text)
    return _DHAKA_RE.sub(lambda m: DHAKA_WORDS[m.group(1)], text)


# Azure's bn-BD voices mispronounce "সাড়ে", so for Azure only:
# "সাড়ে পাঁচটা" -> "পাঁচটা তিরিশে".
_SARE_RE = re.compile(r"সাড়ে\s+([ঀ-৿]+?)টা")


def azure_pronunciation(text: str) -> str:
    return _SARE_RE.sub(r"\1টা তিরিশে", text)


# ---------------------------------------------------------------------------
# Phone numbers as people actually say them
# ---------------------------------------------------------------------------
# Callers mix scripts: "০১৭১২", "zero one seven", "জিরো ওয়ান সেভেন" (English words
# transcribed in Bangla script), "শূন্য এক সাত", and "double one" / "ডাবল ওয়ান".
_NUMBER_WORDS = {
    **{w: "0" for w in ("শূন্য", "শুন্য", "জিরো", "zero", "oh", "o")},
    **{w: "1" for w in ("এক", "ওয়ান", "ওয়ান", "one")},
    **{w: "2" for w in ("দুই", "দুই", "দু", "টু", "two")},
    **{w: "3" for w in ("তিন", "থ্রি", "three")},
    **{w: "4" for w in ("চার", "ফোর", "four")},
    **{w: "5" for w in ("পাঁচ", "ফাইভ", "five")},
    **{w: "6" for w in ("ছয়", "ছয়", "ছ", "সিক্স", "six")},
    **{w: "7" for w in ("সাত", "সেভেন", "seven")},
    **{w: "8" for w in ("আট", "এইট", "eight")},
    **{w: "9" for w in ("নয়", "নয়", "নাইন", "nine")},
}
_REPEAT = {"double": 2, "ডাবল": 2, "triple": 3, "ট্রিপল": 3}
_ASCII = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def spoken_digits(text: str) -> str:
    """'zero one eight double one, তিন চার পাঁচ' -> '01811345'."""
    import unicodedata

    text = unicodedata.normalize("NFC", text).translate(_ASCII).lower()
    out, repeat = [], 1
    for tok in re.findall(r"[0-9]+|[a-z]+|[ঀ-৿]+", text):
        if tok in _REPEAT:
            repeat = _REPEAT[tok]
            continue
        if tok.isdigit():
            out.append(tok[0] * repeat + tok[1:])
        elif tok in _NUMBER_WORDS:
            out.append(_NUMBER_WORDS[tok] * repeat)
        repeat = 1
    return "".join(out)
