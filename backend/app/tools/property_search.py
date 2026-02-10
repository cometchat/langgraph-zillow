"""Zillow property search tool."""

import random
import re
from typing import Any

from langchain_core.tools import tool

from ..data.loader import load_listings
from ..utils.normalizers import (
    get_state_variants,
    normalize_home_type,
    normalize_home_types,
    normalize_sort_order,
)


def tokenize_location(value: str) -> list[str]:
    """Tokenize a location string into searchable tokens."""
    if not value:
        return []
    return [t.strip() for t in re.split(r"[^a-z0-9]+", value.lower()) if t.strip()]


def build_location_groups(location: str) -> list[set[str]]:
    """Build location token groups with state variants."""
    tokens = tokenize_location(location)
    if not tokens:
        return []

    groups = []
    for token in tokens:
        group = {token}
        # Add state variants
        variants = get_state_variants(token)
        group.update(variants)
        groups.append(group)

    return groups


def matches_location(listing: dict[str, Any], location_groups: list[set[str]]) -> bool:
    """Check if a listing matches the location criteria."""
    if not location_groups:
        return True

    # Build haystack from listing address components
    address = listing.get("address", {})
    haystack_parts = [
        listing.get("displayAddress", ""),
        address.get("streetAddress", ""),
        address.get("city", "") or listing.get("city", ""),
        address.get("state", "") or listing.get("state", ""),
        address.get("zipcode", "") or listing.get("zip", ""),
        listing.get("name", ""),
    ]
    haystack = " ".join(str(p) for p in haystack_parts if p).lower()

    # All groups must match
    for group in location_groups:
        if not any(option in haystack for option in group):
            return False

    return True


def filter_listings(
    listings: list[dict[str, Any]],
    location: str | None = None,
    min_price: int | None = None,
    max_price: int | None = None,
    beds_min: int | None = None,
    beds_max: int | None = None,
    baths_min: int | None = None,
    baths_max: int | None = None,
    sqft_max: int | None = None,
    home_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Filter listings by criteria."""
    location_groups = build_location_groups(location or "")
    home_type_set = set(home_types) if home_types else None

    filtered = []
    for listing in listings:
        # Location filter
        if not matches_location(listing, location_groups):
            continue

        # Price filter
        price = listing.get("priceRaw") or listing.get("price")
        if isinstance(price, str):
            price = int(re.sub(r"[^0-9]", "", price) or 0) or None

        if price is not None:
            if max_price is not None and price > max_price:
                continue
            if min_price is not None and price < min_price:
                continue

        # Beds filter
        beds = listing.get("beds")
        if beds_min is not None:
            if not isinstance(beds, (int, float)) or beds < beds_min:
                continue
        if beds_max is not None:
            if not isinstance(beds, (int, float)) or beds > beds_max:
                continue

        # Baths filter
        baths = listing.get("baths")
        if baths_min is not None:
            if not isinstance(baths, (int, float)) or baths < baths_min:
                continue
        if baths_max is not None:
            if not isinstance(baths, (int, float)) or baths > baths_max:
                continue

        # Sqft filter
        sqft = listing.get("livingArea")
        if sqft_max is not None:
            if not isinstance(sqft, (int, float)) or sqft > sqft_max:
                continue

        # Home type filter
        if home_type_set:
            listing_type = normalize_home_type(listing.get("homeType") or listing.get("statusText"))
            if not listing_type or listing_type not in home_type_set:
                continue

        filtered.append(listing)

    return filtered


def sort_listings(
    listings: list[dict[str, Any]],
    sort_order: str | None,
    randomize: bool = True,
) -> list[dict[str, Any]]:
    """Sort listings by the specified order."""
    if not listings:
        return listings

    result = list(listings)

    def safe_number(value: Any, fallback: float) -> float:
        if isinstance(value, (int, float)):
            return float(value)
        return fallback

    if sort_order == "priceLowHigh":
        result.sort(key=lambda x: safe_number(x.get("priceRaw") or x.get("price"), float("inf")))
    elif sort_order == "priceHighLow":
        result.sort(
            key=lambda x: safe_number(x.get("priceRaw") or x.get("price"), float("-inf")),
            reverse=True,
        )
    elif sort_order == "newest":
        result.sort(key=lambda x: safe_number(x.get("zpid"), float("-inf")), reverse=True)
    elif sort_order == "bedsHighLow":
        result.sort(key=lambda x: safe_number(x.get("beds"), float("-inf")), reverse=True)
    elif sort_order == "bathsHighLow":
        result.sort(key=lambda x: safe_number(x.get("baths"), float("-inf")), reverse=True)
    elif sort_order == "sqftHighLow":
        result.sort(key=lambda x: safe_number(x.get("livingArea"), float("-inf")), reverse=True)
    elif randomize:
        random.shuffle(result)

    return result


def format_listing_output(listing: dict[str, Any]) -> dict[str, Any]:
    """Format a listing for output."""
    address = listing.get("address", {})

    address_parts = [
        listing.get("displayAddress"),
        address.get("streetAddress"),
        address.get("city") or listing.get("city"),
        address.get("state") or listing.get("state"),
        address.get("zipcode") or listing.get("zip"),
    ]
    full_address = ", ".join(str(p) for p in address_parts if p) or listing.get(
        "name", "Unknown address"
    )

    price = listing.get("priceRaw") or listing.get("price")
    if isinstance(price, str):
        price = int(re.sub(r"[^0-9]", "", price) or 0) or None

    return {
        "zpid": str(listing.get("zpid", "")),
        "address": full_address,
        "city": address.get("city") or listing.get("city"),
        "state": address.get("state") or listing.get("state"),
        "zip": address.get("zipcode") or listing.get("zip"),
        "price": price,
        "priceDisplay": listing.get("price") if isinstance(listing.get("price"), str) else None,
        "beds": listing.get("beds"),
        "baths": listing.get("baths"),
        "area": listing.get("livingArea"),
        "latitude": listing.get("latitude"),
        "longitude": listing.get("longitude"),
        "statusText": listing.get("homeType"),
        "homeType": listing.get("homeType"),
        "detailUrl": listing.get("detailUrl"),
        "image": listing.get("image"),
        "brokerName": listing.get("brokerName"),
    }


def compute_map_meta(listings: list[dict[str, Any]]) -> dict[str, Any]:
    """Compute map bounds and center from listings."""
    coords = [
        (listing.get("latitude"), listing.get("longitude"))
        for listing in listings
        if isinstance(listing.get("latitude"), (int, float))
        and isinstance(listing.get("longitude"), (int, float))
    ]

    if not coords:
        return {"bounds": None, "center": None}

    lats = [c[0] for c in coords]
    lngs = [c[1] for c in coords]

    return {
        "bounds": {
            "north": max(lats),
            "south": min(lats),
            "east": max(lngs),
            "west": min(lngs),
        },
        "center": {
            "latitude": sum(lats) / len(lats),
            "longitude": sum(lngs) / len(lngs),
        },
    }


@tool("zillowPropertySearchTool")
def zillow_property_search(
    location: str = "",
    minPrice: int | None = None,
    maxPrice: int | None = None,
    bedsMin: int | None = None,
    bedsMax: int | None = None,
    bathsMin: int | None = None,
    bathsMax: int | None = None,
    sqftMax: int | None = None,
    homeTypes: list[str] | None = None,
    sortOrder: str | None = None,
    limit: int | None = None,
    randomize: bool = True,
) -> dict[str, Any]:
    """
    Search Zillow listings by location and filters.

    Args:
        location: Location filter (city, state, ZIP, or address).
        minPrice: Minimum price in USD.
        maxPrice: Maximum price in USD.
        bedsMin: Minimum number of bedrooms.
        bedsMax: Maximum number of bedrooms.
        bathsMin: Minimum number of bathrooms.
        bathsMax: Maximum number of bathrooms.
        sqftMax: Maximum square footage.
        homeTypes: List of home types (SingleFamilyResidence, Townhouse, etc.).
        sortOrder: Sort order (priceLowHigh, priceHighLow, newest, bedsHighLow, bathsHighLow, sqftHighLow).
        limit: Maximum number of results to return.
        randomize: Whether to randomize results (default True, ignored if sortOrder is set).

    Returns:
        Search results with listings and metadata.
    """
    print(f"zillow-property-search called with location={location}, maxPrice={maxPrice}")

    # Load and filter listings
    listings = load_listings()

    # Normalize inputs
    normalized_home_types = normalize_home_types(homeTypes)
    normalized_sort = normalize_sort_order(sortOrder)

    # Resolve min/max conflicts
    resolved_min = minPrice
    resolved_max = maxPrice
    if resolved_min is not None and resolved_max is not None and resolved_min > resolved_max:
        resolved_min, resolved_max = resolved_max, resolved_min

    # Filter
    filtered = filter_listings(
        listings,
        location=location,
        min_price=resolved_min,
        max_price=resolved_max,
        beds_min=bedsMin,
        beds_max=bedsMax,
        baths_min=bathsMin,
        baths_max=bathsMax,
        sqft_max=sqftMax,
        home_types=normalized_home_types,
    )

    # Sort
    sorted_listings = sort_listings(filtered, normalized_sort, randomize)

    # Apply limit
    if limit is not None and limit > 0:
        sorted_listings = sorted_listings[:limit]

    # Format output
    output_listings = [format_listing_output(item) for item in sorted_listings]
    map_meta = compute_map_meta(output_listings)

    return {
        "location": location or "All sample listings",
        "appliedFilters": {
            "minPrice": resolved_min,
            "maxPrice": resolved_max,
            "bedsMin": bedsMin,
            "bedsMax": bedsMax,
            "bathsMin": bathsMin,
            "bathsMax": bathsMax,
            "sqftMax": sqftMax,
            "sortOrder": normalized_sort,
            "homeTypes": normalized_home_types,
        },
        "totalAvailable": len(filtered),
        "returnedCount": len(output_listings),
        "mapBounds": map_meta["bounds"],
        "mapCenter": map_meta["center"],
        "listings": output_listings,
    }
