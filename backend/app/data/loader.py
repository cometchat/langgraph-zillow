"""Listings data loader with caching."""

import json
from pathlib import Path
from typing import Any

_cached_listings: list[dict[str, Any]] | None = None


def load_listings() -> list[dict[str, Any]]:
    """Load and cache listings from JSON file."""
    global _cached_listings

    if _cached_listings is not None:
        return _cached_listings

    data_path = Path(__file__).parent / "listings.json"

    with open(data_path, "r", encoding="utf-8") as f:
        _cached_listings = json.load(f)

    return _cached_listings


def get_listing_by_zpid(zpid: str) -> dict[str, Any] | None:
    """Get a listing by its zpid."""
    listings = load_listings()
    for listing in listings:
        if str(listing.get("zpid")) == str(zpid):
            return listing
    return None


def clear_cache() -> None:
    """Clear the listings cache (useful for testing)."""
    global _cached_listings
    _cached_listings = None
