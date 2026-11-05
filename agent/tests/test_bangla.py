"""Unit tests for the Bangla text helpers (no network, no LLM)."""

import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from bangla import (
    azure_pronunciation,
    dhaka_words,
    say_date,
    say_phone,
    say_time,
    spoken_digits,
)

D = ZoneInfo("Asia/Dhaka")


def at(h: int, m: int) -> datetime:
    return datetime(2026, 11, 8, h, m, tzinfo=D)


def test_spoken_digits_mixed_scripts():
    assert spoken_digits("জিরো ওয়ান নাইন ওয়ান ফাইভ টু থ্রি ফোর, ফাইভ সিক্স সেভেন") == "01915234567"
    assert spoken_digits("শূন্য এক সাত এক দুই তিন চার পাঁচ ছয় সাত আট") == "01712345678"
    assert spoken_digits("০১৫৫২ থ্রি ফোর ফাইভ ছয় সাত আট") == "01552345678"
    assert spoken_digits("01712-345678") == "01712345678"


def test_spoken_digits_double_and_triple():
    assert spoken_digits("zero one eight double one, three four five, six seven eight") == "01811345678"
    assert spoken_digits("ডাবল জিরো") == "00"
    assert spoken_digits("০১৭ ট্রিপল ফাইভ") == "017555"


def test_spoken_digits_azure_bn_bd_output():
    # What Azure bn-BD actually returned for spoken numbers: digits and words mixed.
    assert spoken_digits("01712345 ছয় সাত আট।") == "01712345678"
    assert spoken_digits("জিরো ওয়ান 98765432 ওয়ান।") == "01987654321"
    assert spoken_digits("018 ছয় 05327 আট নয়।") == "01860532789"
    assert spoken_digits("জিরো ওয়ান সেভেন ডাবল ওয়ান টু 34567।") == "01711234567"


def test_spoken_digits_ignores_other_words():
    assert spoken_digits("আমার নাম্বার হলো zero one") == "01"


def test_say_phone_groups_digits():
    assert say_phone("+8801712345678") == "শূন্য এক সাত এক দুই, তিন চার পাঁচ, ছয় সাত আট"


def test_say_time_bangla_conventions():
    assert say_time(at(10, 0)) == "সকাল দশটা"
    assert say_time(at(13, 30)) == "দুপুর দেড়টা"
    assert say_time(at(14, 30)) == "দুপুর আড়াইটা"
    assert say_time(at(17, 30)) == "বিকাল সাড়ে পাঁচটা"
    assert say_time(at(20, 45)) == "রাত পৌনে নয়টা"


def test_say_date():
    assert say_date(at(9, 0)) == "রবিবার, ৮ নভেম্বর"


def test_dhaka_words_replaces_whole_words_only():
    assert dhaka_words("নমস্কার, এক গ্লাস জল আর জলখাবার, জলদি আসুন") == "আসসালামু আলাইকুম, এক গ্লাস পানি আর নাস্তা, জলদি আসুন"
    assert dhaka_words("ডা. নুসরাত জাহান") == "ডাক্তার নুসরাত জাহান"


def test_azure_pronunciation_rewrites_sare():
    assert azure_pronunciation("বিকাল সাড়ে পাঁচটা") == "বিকাল পাঁচটা তিরিশে"



def test_cartesia_gets_appointment_in_bangla_script():
    from bangla import cartesia_pronunciation
    assert cartesia_pronunciation("আপনার appointment-টা বুক হয়ে গেছে") == "আপনার অ্যাপয়েন্টমেন্টটা বুক হয়ে গেছে"
    assert cartesia_pronunciation("কোনো Appointment লাগবে? slot-টা খালি") == "কোনো অ্যাপয়েন্টমেন্ট লাগবে? slot টা খালি"
