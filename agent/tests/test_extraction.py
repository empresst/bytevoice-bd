"""The post-call extraction schema accepts common model variants and rejects bad values."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from extraction import Extraction

BASE = {"summary_bn": "x", "summary_en": "y"}


def test_intent_and_outcome_aliases():
    x = Extraction.model_validate({**BASE, "intent": "book_appointment", "outcome": "Booked"})
    assert (x.intent, x.outcome) == ("book", "booked")
    x = Extraction.model_validate({**BASE, "intent": "inquiry", "outcome": "callback needed"})
    assert (x.intent, x.outcome) == ("enquiry", "follow_up_needed")


def test_romanised_name_must_be_latin():
    x = Extraction.model_validate({**BASE, "intent": "book", "outcome": "booked", "patient_name_en": "রহিম"})
    assert x.patient_name_en is None
    x = Extraction.model_validate({**BASE, "intent": "book", "outcome": "booked", "patient_name_en": "Md. Rahim Uddin"})
    assert x.patient_name_en == "Md. Rahim Uddin"
