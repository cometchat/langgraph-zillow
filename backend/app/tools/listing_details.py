"""Zillow listing details tool."""

import re
from typing import Any

from langchain_core.tools import tool

from ..data.loader import load_listings
from ..utils.logging import logger

# Stop words for slug matching
SLUG_STOP_WORDS = {
    "http",
    "https",
    "www",
    "com",
    "www-zillow-com",
    "zillow",
    "zillow-com",
    "homedetails",
    "m",
    "app",
}


def slugify(value: Any) -> str:
    """Convert a value to a URL-friendly slug."""
    if value is None:
        return ""
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", str(value).strip().lower()))


def should_keep_slug(slug: str) -> bool:
    """Check if a slug should be kept for matching."""
    if not slug or len(slug) < 3:
        return False
    if slug in SLUG_STOP_WORDS:
        return False
    if slug.startswith("http-") or slug.startswith("https-"):
        return False
    return True


def normalize_slug_tokens(slug: str) -> list[str]:
    """Normalize a slug into tokens."""
    if not slug:
        return []
    return [t for t in slug.split("-") if t and t not in SLUG_STOP_WORDS]


def extract_zpid_from_url(url: str) -> str | None:
    """Extract zpid from a Zillow URL."""
    if not url:
        return None

    # Match patterns like "27334771_zpid"
    match = re.search(r"(\d+)(?=_zpid)", url, re.IGNORECASE)
    if match:
        return match.group(1)

    # Match any 5+ digit number
    match = re.search(r"\b(\d{5,})\b", url)
    if match:
        return match.group(1)

    return None


def collect_listing_slugs(listing: dict[str, Any]) -> set[str]:
    """Collect all slugs for a listing."""
    slugs = set()

    def add_slug(value: Any) -> None:
        slug = slugify(value)
        if should_keep_slug(slug):
            slugs.add(slug)

    # Add from detailUrl
    detail_url = listing.get("detailUrl", "")
    if detail_url:
        add_slug(detail_url)
        for part in detail_url.split("/"):
            add_slug(part)

    # Add from address components
    add_slug(listing.get("displayAddress"))
    add_slug(listing.get("name"))

    address = listing.get("address", {})
    address_parts = [
        address.get("streetAddress"),
        address.get("city"),
        address.get("state"),
        address.get("zipcode"),
    ]
    add_slug(" ".join(str(p) for p in address_parts if p))

    add_slug(listing.get("zpid"))

    return slugs


def find_listing_by_slug(input_value: str, listings: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Find a listing by slug matching."""
    input_slug = slugify(input_value)
    if not input_slug:
        return None

    input_tokens = normalize_slug_tokens(input_slug)
    if not input_tokens:
        return None

    for listing in listings:
        slugs = collect_listing_slugs(listing)
        for slug in slugs:
            if not slug:
                continue

            # Exact match
            if slug == input_slug:
                return listing

            # Token prefix match
            slug_tokens = normalize_slug_tokens(slug)
            if not slug_tokens:
                continue

            min_match = min(len(slug_tokens), len(input_tokens))
            slug_prefix = "-".join(slug_tokens[:min_match])
            input_prefix = "-".join(input_tokens[:min_match])

            if slug_prefix == input_prefix:
                return listing

    return None


def find_listing(
    listings: list[dict[str, Any]],
    zpid: str | None = None,
    detail_url: str | None = None,
    address: str | None = None,
) -> dict[str, Any] | None:
    """Find a listing by zpid, detailUrl, or address."""
    # Try zpid first
    if zpid:
        for listing in listings:
            if str(listing.get("zpid")) == str(zpid):
                return listing

    # Try detailUrl
    if detail_url:
        normalized = detail_url.strip().lower()
        for listing in listings:
            if listing.get("detailUrl", "").strip().lower() == normalized:
                return listing

        # Try extracting zpid from URL
        extracted_zpid = extract_zpid_from_url(detail_url)
        if extracted_zpid:
            for listing in listings:
                if str(listing.get("zpid")) == extracted_zpid:
                    return listing

        # Try slug matching
        match = find_listing_by_slug(detail_url, listings)
        if match:
            return match

    # Try address
    if address:
        match = find_listing_by_slug(address, listings)
        if match:
            return match

    return None


def format_address(listing: dict[str, Any]) -> dict[str, Any]:
    """Format listing address."""
    address = listing.get("address", {})

    parts = [
        listing.get("displayAddress"),
        address.get("streetAddress"),
        address.get("city") or listing.get("city"),
        address.get("state") or listing.get("state"),
        address.get("zipcode") or listing.get("zip"),
    ]
    full = ", ".join(str(p) for p in parts if p) or listing.get("name", "Unknown address")

    return {
        "full": full,
        "streetAddress": address.get("streetAddress"),
        "city": address.get("city") or listing.get("city"),
        "state": address.get("state") or listing.get("state"),
        "zipcode": address.get("zipcode") or listing.get("zip"),
    }


def format_price_history(listing: dict[str, Any]) -> list[dict[str, Any]]:
    """Format price history."""
    history = listing.get("priceHistory") or listing.get("price_history") or []
    if not isinstance(history, list):
        return []

    formatted = []
    for entry in history:
        if not isinstance(entry, dict):
            continue

        price = entry.get("price") or entry.get("amount")
        if isinstance(price, (int, float)):
            price_formatted = f"${price:,.0f}"
        else:
            price_formatted = None

        formatted.append(
            {
                "date": entry.get("date") or entry.get("eventDate"),
                "price": price if isinstance(price, (int, float)) else None,
                "priceFormatted": price_formatted,
                "event": entry.get("event") or entry.get("title"),
                "change": entry.get("change") or entry.get("delta"),
            }
        )

    return formatted


def format_schools(listing: dict[str, Any]) -> list[dict[str, Any]]:
    """Format nearby schools."""
    schools = listing.get("nearbySchools") or listing.get("schools") or []
    if not isinstance(schools, list):
        return []

    formatted = []
    for school in schools:
        if not isinstance(school, dict):
            continue

        name = school.get("name") or school.get("schoolName")
        if not name:
            continue

        rating = school.get("rating") or school.get("score")
        if isinstance(rating, str):
            match = re.search(r"(\d+(?:\.\d+)?)", rating)
            rating = float(match.group(1)) if match else None

        formatted.append(
            {
                "name": name,
                "rating": rating,
                "level": school.get("level") or school.get("levels"),
                "grades": school.get("grades") or school.get("gradeRange"),
                "type": school.get("type") or school.get("schoolType"),
                "distance": school.get("distance") or school.get("distanceText"),
            }
        )

    return formatted


def format_buy_ability(listing: dict[str, Any]) -> dict[str, Any] | None:
    """Format buyAbility information."""
    buy_ability = listing.get("buyAbility") or listing.get("buyAbilityInfo")
    if not isinstance(buy_ability, dict):
        return None

    breakdown = buy_ability.get("breakdown", [])
    if isinstance(breakdown, list):
        formatted_breakdown = []
        for item in breakdown:
            if isinstance(item, dict):
                label = item.get("label") or item.get("name")
                amount = item.get("amount") or item.get("value")
                if label and amount:
                    formatted_breakdown.append({"label": label, "amount": str(amount)})
    else:
        formatted_breakdown = None

    return {
        "estimate": buy_ability.get("estimate") or buy_ability.get("summary"),
        "breakdown": formatted_breakdown,
    }


def format_climate_factors(listing: dict[str, Any]) -> list[dict[str, Any]]:
    """Format climate factors."""
    factors = listing.get("climateFactors") or listing.get("climateRisk") or []
    if not isinstance(factors, list):
        return []

    return [
        {
            "label": f.get("label"),
            "value": f.get("value"),
            "description": f.get("description"),
        }
        for f in factors
        if isinstance(f, dict)
    ]


@tool("zillowListingDetailsTool")
def zillow_listing_details(
    zpid: str | None = None,
    detailUrl: str | None = None,
    address: str | None = None,
) -> dict[str, Any]:
    """
    Get detailed information about a specific Zillow listing.

    Args:
        zpid: Zillow property identifier.
        detailUrl: Full Zillow URL for the property.
        address: Full property address (street, city, state, ZIP).

    Returns:
        Detailed listing information or error if not found.
    """
    logger.debug(
        "zillow-listing-details called with zpid=%s, detailUrl=%s, address=%s",
        zpid,
        detailUrl,
        address,
    )

    listings = load_listings()
    listing = find_listing(listings, zpid, detailUrl, address)

    if not listing:
        return {"error": "Property not found in sample dataset"}

    formatted_address = format_address(listing)
    price = listing.get("priceRaw") or listing.get("price")
    if isinstance(price, str):
        price = int(re.sub(r"[^0-9]", "", price) or 0) or None

    schools = format_schools(listing)
    price_history = format_price_history(listing)
    buy_ability = format_buy_ability(listing)
    climate_factors = format_climate_factors(listing)

    # Build summaries
    buy_ability_summary = None
    if buy_ability and buy_ability.get("estimate"):
        breakdown_parts = []
        if buy_ability.get("breakdown"):
            breakdown_parts = [f"{b['label']}: {b['amount']}" for b in buy_ability["breakdown"][:3]]
        buy_ability_summary = buy_ability["estimate"]
        if breakdown_parts:
            buy_ability_summary += f" ({'; '.join(breakdown_parts)})"

    climate_summary = None
    if climate_factors:
        parts = [
            f"{f['label']} {f['value']}"
            for f in climate_factors[:3]
            if f.get("label") and f.get("value")
        ]
        climate_summary = ", ".join(parts) if parts else None

    parking = (
        listing.get("propertyDetails", {}).get("parking")
        if isinstance(listing.get("propertyDetails"), dict)
        else None
    )
    parking_summary = None
    if parking:
        parts = []
        if parking.get("totalSpaces"):
            parts.append(f"{parking['totalSpaces']} total spaces")
        if parking.get("features"):
            parts.append(", ".join(parking["features"][:3]))
        parking_summary = "; ".join(parts) if parts else None

    price_history_summary = None
    if price_history:
        entries = []
        for entry in price_history[:3]:
            price_label = entry.get("priceFormatted") or (
                f"${entry['price']:,.0f}" if entry.get("price") else None
            )
            change_label = f" ({entry['change']})" if entry.get("change") else ""
            entries.append(
                f"{entry['date']}: {entry.get('event', 'Update')}{' at ' + price_label if price_label else ''}{change_label}"
            )
        price_history_summary = " | ".join(entries) if entries else None

    return {
        "zpid": str(listing.get("zpid", "")),
        "detailUrl": listing.get("detailUrl"),
        "address": formatted_address,
        "homeDetails": {
            "price": price,
            "currency": "USD",
            "beds": listing.get("beds"),
            "baths": listing.get("baths"),
            "livingArea": listing.get("livingArea"),
            "lotSize": listing.get("lotSize"),
            "yearBuilt": listing.get("yearBuilt"),
            "homeType": listing.get("homeType"),
            "status": "For Sale",
            "timeOnZillow": f"{listing.get('daysOnZillow')} days"
            if listing.get("daysOnZillow")
            else None,
            "description": listing.get("description"),
        },
        "highlights": listing.get("highlights", []),
        "badge": listing.get("badge"),
        "nearbySchools": schools,
        "schoolNote": listing.get("schoolNote"),
        "neighborhoodNote": listing.get("neighborhoodNote"),
        "priceHistory": price_history,
        "climateFactors": climate_factors,
        "buyAbility": buy_ability,
        "images": listing.get("images", []),
        "image": listing.get("image"),
        "primaryPhoto": listing.get("image"),
        "propertyDetails": listing.get("propertyDetails"),
        "financialDetails": listing.get("financialDetails"),
        "buyAbilitySummary": buy_ability_summary,
        "climateSummary": climate_summary,
        "parkingSummary": parking_summary,
        "priceHistorySummary": price_history_summary,
        "metadata": {
            "latitude": listing.get("latitude"),
            "longitude": listing.get("longitude"),
            "homeType": listing.get("homeType"),
            "badge": listing.get("badge"),
        },
    }
