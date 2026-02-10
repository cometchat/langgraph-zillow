"""Context extraction from CometChat forwardedProps."""

from dataclasses import dataclass, field
from typing import Any

from .normalizers import (
    coerce_bool,
    coerce_number,
    coerce_string,
    normalize_home_types,
    normalize_sort_order,
)


@dataclass
class FilterHints:
    """Extracted filter hints from context."""

    location: str | None = None
    minPrice: int | None = None
    maxPrice: int | None = None
    bedsMin: int | None = None
    bedsMax: int | None = None
    bathsMin: int | None = None
    bathsMax: int | None = None
    sqftMax: int | None = None
    sortOrder: str | None = None
    homeTypes: list[str] | None = None
    limit: int | None = None
    randomize: bool | None = None


@dataclass
class ListingHints:
    """Extracted listing identifier hints from context."""

    zpid: str | None = None
    detailUrl: str | None = None
    address: str | None = None


@dataclass
class RuntimeContext:
    """Complete runtime context extracted from forwardedProps."""

    sender_uid: str = "unknown"
    sender_role: str = "unspecified"
    sender_name: str | None = None
    filter_hints: FilterHints = field(default_factory=FilterHints)
    listing_hints: ListingHints = field(default_factory=ListingHints)
    metadata_keys: list[str] = field(default_factory=list)
    scenario_hint: str | None = None


# Key variations for extraction
ZPID_KEYS = [
    "zpid",
    "listing_zpid",
    "listingZpid",
    "zipid",
    "homeId",
    "propertyId",
    "property_id",
    "listingId",
    "listing_id",
]

DETAIL_URL_KEYS = [
    "detailUrl",
    "detail_url",
    "listing_detail_url",
    "listingDetailUrl",
    "listingDetailURL",
    "detailUrlSlug",
    "detail_url_slug",
    "listing_detail_url_slug",
    "listingDetailUrlSlug",
    "detailUrlPath",
    "detail_url_path",
]

ADDRESS_KEYS = [
    "address",
    "fullAddress",
    "displayAddress",
    "streetAddress",
    "street",
    "addressFull",
    "address_full",
    "full_address",
    "propertyAddress",
    "property_address",
    "addressLine",
    "address_line",
    "name",
    "label",
    "title",
]

LOCATION_KEYS = [
    "location",
    "query",
    "searchTerm",
    "search_query",
    "searchQuery",
    "searchText",
    "search_text",
    "keyword",
    "keywords",
    "city",
    "state",
    "region",
    "zip",
    "zipcode",
    "postalCode",
    "place",
]

MIN_PRICE_KEYS = [
    "minPrice",
    "priceMin",
    "minimum",
    "min_price",
    "min",
    "minBudget",
    "min_budget",
    "lowerPrice",
    "price_lower",
    "priceFloor",
    "price_floor",
]

MAX_PRICE_KEYS = [
    "maxPrice",
    "priceMax",
    "maximum",
    "max_price",
    "max",
    "maxBudget",
    "max_budget",
    "upperPrice",
    "price_upper",
    "priceCeiling",
    "price_ceiling",
]

BEDS_MIN_KEYS = ["bedsMin", "minBeds", "beds", "bedrooms", "min_beds"]
BEDS_MAX_KEYS = ["bedsMax", "maxBeds", "bedsMaxValue", "beds_upper", "max_beds"]
BATHS_MIN_KEYS = ["bathsMin", "minBaths", "baths", "bathrooms", "min_baths"]
BATHS_MAX_KEYS = ["bathsMax", "maxBaths", "bathsMaxValue", "baths_upper", "max_baths"]

SQFT_MAX_KEYS = [
    "sqftMax",
    "maxSqft",
    "squareFootageMax",
    "maxSquareFeet",
    "maxSquareFootage",
    "livingAreaMax",
    "maxLivingArea",
    "square_footage_max",
]

SORT_KEYS = ["sortOrder", "sort", "sort_order", "order", "ordering", "sortBy"]
LIMIT_KEYS = [
    "limit",
    "resultLimit",
    "maxResults",
    "pageSize",
    "page_size",
    "take",
    "size",
    "pageLimit",
    "perPage",
]
HOME_TYPES_KEYS = ["homeTypes", "home_types", "propertyTypes", "property_types", "types"]
RANDOMIZE_KEYS = ["randomize", "shuffle", "isRandomized"]

FOCUS_KEYS = [
    "topic",
    "questionTopic",
    "question_type",
    "questionType",
    "section",
    "focus",
    "focusTopic",
    "intent",
    "requestType",
    "scenario",
    "userNeed",
    "user_goal",
    "goal",
    "promptType",
]

# Nested record keys to traverse
NESTED_RECORD_KEYS = [
    "metadata",
    "messageMetadata",
    "data",
    "payload",
    "context",
    "filters",
    "activeFilters",
    "appliedFilters",
    "uiFilters",
    "currentFilters",
    "current_filters",
    "filter",
    "filterData",
    "filterMetadata",
    "params",
    "parameters",
    "options",
    "priceRange",
    "range",
    "detail",
    "listing",
    "listingMetadata",
    "request",
    "input",
    "extras",
    "searchFilters",
    "listingContext",
    "propertyContext",
]


def is_plain_object(value: Any) -> bool:
    """Check if value is a plain dict."""
    return isinstance(value, dict)


def parse_json_string(value: Any) -> dict | None:
    """Try to parse a JSON string into a dict."""
    if not isinstance(value, str):
        return None

    trimmed = value.strip()
    if not (trimmed.startswith("{") or trimmed.startswith("[")):
        return None

    try:
        import json

        parsed = json.loads(trimmed)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, ValueError):
        pass

    return None


def collect_candidate_records(*candidates: Any, max_depth: int = 3) -> list[dict[str, Any]]:
    """Recursively collect all candidate records from nested structures."""
    records: list[dict[str, Any]] = []
    visited: set[int] = set()

    def visit(value: Any, depth: int = 0) -> None:
        if value is None or depth > max_depth:
            return

        obj_id = id(value)
        if obj_id in visited:
            return

        # Try parsing JSON strings
        if isinstance(value, str):
            parsed = parse_json_string(value)
            if parsed:
                visit(parsed, depth + 1)
            return

        # Handle lists
        if isinstance(value, list):
            if depth < max_depth:
                for item in value:
                    visit(item, depth + 1)
            return

        # Handle dicts
        if not is_plain_object(value):
            return

        visited.add(obj_id)
        records.append(value)

        if depth >= max_depth:
            return

        # Traverse nested keys
        for key in NESTED_RECORD_KEYS:
            if key in value:
                visit(value[key], depth + 1)

    for candidate in candidates:
        visit(candidate, 0)

    return records


def pick_value(records: list[dict[str, Any]], keys: list[str], parser: callable) -> Any:
    """Pick the first valid value from records using key variations."""
    for record in records:
        for key in keys:
            if key not in record:
                continue
            parsed = parser(record[key])
            if parsed is not None:
                return parsed
    return None


def pick_string_value(records: list[dict[str, Any]], keys: list[str]) -> str | None:
    """Pick a string value from records."""
    return pick_value(records, keys, coerce_string)


def pick_number_value(records: list[dict[str, Any]], keys: list[str]) -> int | float | None:
    """Pick a number value from records."""
    return pick_value(records, keys, coerce_number)


def pick_bool_value(records: list[dict[str, Any]], keys: list[str]) -> bool | None:
    """Pick a boolean value from records."""
    return pick_value(records, keys, coerce_bool)


def pick_home_types_value(records: list[dict[str, Any]], keys: list[str]) -> list[str] | None:
    """Pick and normalize home types from records."""
    for record in records:
        for key in keys:
            if key not in record:
                continue
            normalized = normalize_home_types(record[key])
            if normalized:
                return normalized
    return None


def extract_runtime_context(forwarded_props: dict[str, Any] | None) -> RuntimeContext:
    """Extract runtime context from forwardedProps."""
    if not forwarded_props:
        return RuntimeContext()

    cometchat = forwarded_props.get("cometchatContext", {})
    if not isinstance(cometchat, dict):
        cometchat = {}

    sender = cometchat.get("sender", {})
    if not isinstance(sender, dict):
        sender = {}

    metadata = cometchat.get("messageMetadata", {})
    if not isinstance(metadata, dict):
        metadata = {}

    # Debug: log the metadata structure
    print(f"[extract_runtime_context] metadata keys: {list(metadata.keys())}")
    print(f"[extract_runtime_context] metadata: {metadata}")

    # Collect all candidate records for value extraction
    # Include explicit paths for nested listing context
    context_obj = metadata.get("context", {}) if isinstance(metadata.get("context"), dict) else {}
    listing_obj = (
        context_obj.get("listing", {}) if isinstance(context_obj.get("listing"), dict) else {}
    )

    records = collect_candidate_records(
        metadata,
        metadata.get("metadata"),
        metadata.get("data"),
        metadata.get("filters"),
        metadata.get("activeFilters"),
        metadata.get("appliedFilters"),
        metadata.get("uiFilters"),
        context_obj,
        listing_obj,
        cometchat,
        forwarded_props,
    )

    # Debug: log collected records count
    print(f"[extract_runtime_context] collected {len(records)} candidate records")

    # Extract filter hints
    filter_hints = FilterHints(
        location=pick_string_value(records, LOCATION_KEYS),
        minPrice=_safe_int(pick_number_value(records, MIN_PRICE_KEYS)),
        maxPrice=_safe_int(pick_number_value(records, MAX_PRICE_KEYS)),
        bedsMin=_safe_int(pick_number_value(records, BEDS_MIN_KEYS)),
        bedsMax=_safe_int(pick_number_value(records, BEDS_MAX_KEYS)),
        bathsMin=_safe_int(pick_number_value(records, BATHS_MIN_KEYS)),
        bathsMax=_safe_int(pick_number_value(records, BATHS_MAX_KEYS)),
        sqftMax=_safe_int(pick_number_value(records, SQFT_MAX_KEYS)),
        sortOrder=normalize_sort_order(pick_string_value(records, SORT_KEYS)),
        homeTypes=pick_home_types_value(records, HOME_TYPES_KEYS),
        limit=_safe_int(pick_number_value(records, LIMIT_KEYS)),
        randomize=pick_bool_value(records, RANDOMIZE_KEYS),
    )

    # Extract listing hints
    listing_hints = ListingHints(
        zpid=pick_string_value(records, ZPID_KEYS),
        detailUrl=pick_string_value(records, DETAIL_URL_KEYS),
        address=pick_string_value(records, ADDRESS_KEYS),
    )

    # Debug: log extracted listing hints
    print(
        f"[extract_runtime_context] listing_hints: zpid={listing_hints.zpid}, "
        f"detailUrl={listing_hints.detailUrl}, address={listing_hints.address}"
    )

    # Collect metadata keys for debugging
    metadata_keys = list(metadata.keys()) if metadata else []

    return RuntimeContext(
        sender_uid=coerce_string(sender.get("uid")) or "unknown",
        sender_role=coerce_string(sender.get("role")) or "unspecified",
        sender_name=coerce_string(sender.get("name")),
        filter_hints=filter_hints,
        listing_hints=listing_hints,
        metadata_keys=metadata_keys,
        scenario_hint=pick_string_value(records, FOCUS_KEYS),
    )


def _safe_int(value: int | float | None) -> int | None:
    """Safely convert to int."""
    if value is None:
        return None
    return int(value)


def format_filter_summary(hints: FilterHints) -> str:
    """Format filter hints as a summary string."""
    parts = []

    if hints.location:
        parts.append(f"location={hints.location}")
    if hints.minPrice is not None or hints.maxPrice is not None:
        price_range = _format_price_range(hints.minPrice, hints.maxPrice)
        parts.append(f"price {price_range}")
    if hints.bedsMin is not None:
        parts.append(f"bedsMin>={hints.bedsMin}")
    if hints.bedsMax is not None:
        parts.append(f"bedsMax<={hints.bedsMax}")
    if hints.bathsMin is not None:
        parts.append(f"bathsMin>={hints.bathsMin}")
    if hints.bathsMax is not None:
        parts.append(f"bathsMax<={hints.bathsMax}")
    if hints.sqftMax is not None:
        parts.append(f"sqftMax<={hints.sqftMax}")
    if hints.homeTypes:
        parts.append(f"homeTypes={'/'.join(hints.homeTypes)}")
    if hints.sortOrder:
        parts.append(f"sortOrder={hints.sortOrder}")
    if hints.limit is not None:
        parts.append(f"limit={hints.limit}")

    return "; ".join(parts) if parts else "none detected"


def format_listing_hints(hints: ListingHints) -> str:
    """Format listing hints as a summary string."""
    parts = []

    if hints.zpid:
        parts.append(f"zpid {hints.zpid}")
    if hints.detailUrl:
        parts.append(hints.detailUrl)
    if hints.address:
        parts.append(hints.address)

    return " | ".join(parts) if parts else "none detected"


def _format_price_range(min_price: int | None, max_price: int | None) -> str:
    """Format a price range."""
    if min_price is not None and max_price is not None:
        return f"${min_price:,} – ${max_price:,}"
    if min_price is not None:
        return f"${min_price:,}+"
    if max_price is not None:
        return f"<= ${max_price:,}"
    return "n/a"
