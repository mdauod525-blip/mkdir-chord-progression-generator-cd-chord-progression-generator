"""Address normalization used for de-duplication across providers (USPS-style abbreviations)."""
from __future__ import annotations

import re

SUFFIXES = {
    "STREET": "ST", "STR": "ST", "ROAD": "RD", "AVENUE": "AVE", "AV": "AVE", "DRIVE": "DR",
    "COURT": "CT", "LANE": "LN", "PLACE": "PL", "CIRCLE": "CIR", "BOULEVARD": "BLVD",
    "TERRACE": "TER", "PARKWAY": "PKWY", "HIGHWAY": "HWY", "SQUARE": "SQ", "TRAIL": "TRL",
    "PIKE": "PIKE", "RUN": "RUN", "WAY": "WAY", "POINT": "PT", "CROSSING": "XING", "RIDGE": "RDG",
    "HEIGHTS": "HTS", "MOUNT": "MT", "LOOP": "LOOP", "TURNPIKE": "TPKE", "GLEN": "GLN",
}
DIRECTIONS = {"NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W", "NORTHEAST": "NE",
              "NORTHWEST": "NW", "SOUTHEAST": "SE", "SOUTHWEST": "SW"}
UNIT_WORDS = ("APT", "APARTMENT", "UNIT", "STE", "SUITE", "#", "BLDG", "FL")
_UNIT_RE = re.compile(r"\s(?:APT|APARTMENT|UNIT|STE|SUITE|BLDG|FL|#)\s*([A-Z0-9-]+)\s*$")


def normalize_street(line: str) -> tuple[str, str | None]:
    s = (line or "").upper().strip()
    s = s.replace("#", " # ")
    s = re.sub(r"[.,]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    unit = None
    m = _UNIT_RE.search(" " + s)
    if m:
        unit = m.group(1)
        s = (" " + s)[: m.start()].strip()
    words = [DIRECTIONS.get(w, SUFFIXES.get(w, w)) for w in s.split(" ")]
    return " ".join(words), unit


def zip5(z: str | None) -> str:
    return re.sub(r"[^0-9]", "", z or "")[:5]


def address_key(line: str, city: str | None, state: str | None, zip_code: str | None, unit: str | None = None) -> str:
    street, parsed_unit = normalize_street(line)
    u = (unit or parsed_unit or "").upper().strip()
    z = zip5(zip_code)
    loc = z if z else f"{(city or '').upper().strip()}-{(state or '').upper().strip()}"
    return f"{street}|{u}|{loc}"
