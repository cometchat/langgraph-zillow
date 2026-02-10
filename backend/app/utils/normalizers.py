"""Input normalization utilities for state names, home types, and sort orders."""

import re
from typing import Any

# State name to abbreviation mapping
STATE_NAME_TO_ABBR: dict[str, str] = {
    "alabama": "al",
    "alaska": "ak",
    "arizona": "az",
    "arkansas": "ar",
    "california": "ca",
    "colorado": "co",
    "connecticut": "ct",
    "delaware": "de",
    "district of columbia": "dc",
    "florida": "fl",
    "georgia": "ga",
    "hawaii": "hi",
    "idaho": "id",
    "illinois": "il",
    "indiana": "in",
    "iowa": "ia",
    "kansas": "ks",
    "kentucky": "ky",
    "louisiana": "la",
    "maine": "me",
    "maryland": "md",
    "massachusetts": "ma",
    "michigan": "mi",
    "minnesota": "mn",
    "mississippi": "ms",
    "missouri": "mo",
    "montana": "mt",
    "nebraska": "ne",
    "nevada": "nv",
    "new hampshire": "nh",
    "new jersey": "nj",
    "new mexico": "nm",
    "new york": "ny",
    "north carolina": "nc",
    "north dakota": "nd",
    "ohio": "oh",
    "oklahoma": "ok",
    "oregon": "or",
    "pennsylvania": "pa",
    "rhode island": "ri",
    "south carolina": "sc",
    "south dakota": "sd",
    "tennessee": "tn",
    "texas": "tx",
    "utah": "ut",
    "vermont": "vt",
    "virginia": "va",
    "washington": "wa",
    "west virginia": "wv",
    "wisconsin": "wi",
    "wyoming": "wy",
}

STATE_ABBR_TO_NAME: dict[str, str] = {v: k for k, v in STATE_NAME_TO_ABBR.items()}


def normalize_state(value: str | None) -> tuple[str | None, str | None]:
    """
    Normalize a state name to both full name and abbreviation.

    Returns:
        Tuple of (full_name, abbreviation) or (None, None) if not recognized.
    """
    if not value:
        return None, None

    lower = value.strip().lower()

    # Check if it's a full state name
    if lower in STATE_NAME_TO_ABBR:
        return lower, STATE_NAME_TO_ABBR[lower]

    # Check if it's an abbreviation
    if lower in STATE_ABBR_TO_NAME:
        return STATE_ABBR_TO_NAME[lower], lower

    return None, None


def get_state_variants(value: str | None) -> set[str]:
    """Get all variants of a state name for matching."""
    if not value:
        return set()

    full_name, abbr = normalize_state(value)
    variants = {value.lower().strip()}

    if full_name:
        variants.add(full_name)
    if abbr:
        variants.add(abbr)

    return variants


# Home type normalization
HOME_TYPE_OPTIONS = [
    {
        "id": "SingleFamilyResidence",
        "aliases": [
            "singlefamilyresidence",
            "single family residence",
            "singlefamily",
            "house",
            "houses",
            "single family",
            "single-family",
            "sfr",
        ],
    },
    {
        "id": "Townhouse",
        "aliases": ["townhouse", "town home", "townhomes", "townhouses", "town house"],
    },
    {
        "id": "MultiFamily",
        "aliases": ["multifamily", "multi family", "duplex", "triplex", "quadplex", "multi-family"],
    },
    {
        "id": "Condominium",
        "aliases": ["condominium", "condo", "condos", "co-op", "coop"],
    },
    {
        "id": "LotsLand",
        "aliases": ["lotsland", "lot", "land", "acreage", "vacant", "lots"],
    },
    {
        "id": "Apartment",
        "aliases": ["apartment", "apartments", "flat", "flats"],
    },
    {
        "id": "Manufactured",
        "aliases": ["manufactured", "mobile", "mobilehome", "mobile home", "trailer"],
    },
]

# Build alias map
HOME_TYPE_ALIAS_MAP: dict[str, str] = {}
for option in HOME_TYPE_OPTIONS:
    canonical = option["id"]
    HOME_TYPE_ALIAS_MAP[canonical.lower()] = canonical
    HOME_TYPE_ALIAS_MAP[re.sub(r"\s+", "", canonical.lower())] = canonical
    for alias in option["aliases"]:
        key = re.sub(r"\s+", "", alias.lower())
        HOME_TYPE_ALIAS_MAP[key] = canonical


def normalize_home_type(value: Any) -> str | None:
    """Normalize a home type alias to its canonical form."""
    if value is None:
        return None

    key = re.sub(r"\s+", "", str(value).lower())
    return HOME_TYPE_ALIAS_MAP.get(key)


def normalize_home_types(values: list[str] | str | None) -> list[str] | None:
    """Normalize a list of home types."""
    if values is None:
        return None

    if isinstance(values, str):
        # Split by common delimiters
        values = re.split(r"[\s,;|/]+", values)

    normalized = []
    seen = set()
    for v in values:
        canonical = normalize_home_type(v)
        if canonical and canonical not in seen:
            normalized.append(canonical)
            seen.add(canonical)

    return normalized if normalized else None


# Sort order normalization
SORT_ALIASES: dict[str, str] = {
    # homesForYou / default
    "homesforyou": "homesForYou",
    "default": "homesForYou",
    "recommended": "homesForYou",
    # priceLowHigh
    "pricelowhigh": "priceLowHigh",
    "lowtohigh": "priceLowHigh",
    "lowestprice": "priceLowHigh",
    "priceasc": "priceLowHigh",
    "ascprice": "priceLowHigh",
    "priceascending": "priceLowHigh",
    "cheapest": "priceLowHigh",
    # priceHighLow
    "pricehighlow": "priceHighLow",
    "hightolow": "priceHighLow",
    "highestprice": "priceHighLow",
    "pricedesc": "priceHighLow",
    "descprice": "priceHighLow",
    "pricedescending": "priceHighLow",
    "mostexpensive": "priceHighLow",
    # newest
    "newest": "newest",
    "recent": "newest",
    "recentlyadded": "newest",
    "latest": "newest",
    # bedsHighLow
    "bedshighlow": "bedsHighLow",
    "mostbeds": "bedsHighLow",
    "bedroomsdesc": "bedsHighLow",
    "mostbedrooms": "bedsHighLow",
    # bathsHighLow
    "bathshighlow": "bathsHighLow",
    "mostbaths": "bathsHighLow",
    "bathroomsdesc": "bathsHighLow",
    "mostbathrooms": "bathsHighLow",
    # sqftHighLow
    "sqfthighlow": "sqftHighLow",
    "largest": "sqftHighLow",
    "sizehighlow": "sqftHighLow",
    "biggestsize": "sqftHighLow",
    "mostsquarefeet": "sqftHighLow",
}


def normalize_sort_order(value: Any) -> str | None:
    """Normalize a sort order alias to its canonical form."""
    if not value:
        return None

    raw = str(value).strip()
    if not raw:
        return None

    # Direct lookup
    lower = raw.lower()
    if lower in SORT_ALIASES:
        return SORT_ALIASES[lower]

    # Compact form (remove non-alpha)
    compact = re.sub(r"[^a-zA-Z]", "", raw).lower()
    if compact in SORT_ALIASES:
        return SORT_ALIASES[compact]

    # Pattern matching for complex phrases
    if "price" in lower:
        if any(x in lower for x in ["low to high", "ascending", "asc", "lowest", "cheapest"]):
            return "priceLowHigh"
        if any(x in lower for x in ["high to low", "descending", "desc", "highest", "expensive"]):
            return "priceHighLow"

    if any(x in lower for x in ["bedroom", "bed "]) or "bed" in compact:
        return "bedsHighLow"

    if any(x in lower for x in ["bathroom", "bath "]) or "bath" in compact:
        return "bathsHighLow"

    if any(x in lower for x in ["newest", "recent", "latest"]):
        return "newest"

    sqft_patterns = [
        "sqft",
        "sq.ft",
        "sq ft",
        "sq-feet",
        "sqfeet",
        "squarefoot",
        "squarefeet",
        "squarefootage",
        "square feet",
    ]
    if any(p in lower for p in sqft_patterns):
        return "sqftHighLow"

    return SORT_ALIASES.get(compact)


def coerce_number(value: Any) -> int | float | None:
    """Coerce a value to a number."""
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return value if not (isinstance(value, float) and not value.is_integer()) else value

    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed:
            return None
        # Remove currency symbols and commas
        cleaned = re.sub(r"[^0-9.+-]", "", trimmed)
        try:
            if "." in cleaned:
                return float(cleaned)
            return int(cleaned)
        except ValueError:
            return None

    return None


def coerce_string(value: Any) -> str | None:
    """Coerce a value to a string."""
    if value is None:
        return None

    if isinstance(value, str):
        trimmed = value.strip()
        return trimmed if trimmed else None

    if isinstance(value, (int, float)):
        return str(value)

    return None


def coerce_bool(value: Any) -> bool | None:
    """Coerce a value to a boolean."""
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        lower = value.strip().lower()
        if lower in ("true", "1", "yes", "y", "t", "on", "enabled"):
            return True
        if lower in ("false", "0", "no", "n", "f", "off", "disabled"):
            return False

    return None
