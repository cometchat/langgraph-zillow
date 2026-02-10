"""Tests for property search tool."""

import pytest
from app.tools.property_search import (
    filter_listings,
    sort_listings,
    format_listing_output,
    zillow_property_search,
)


# Sample test listings
SAMPLE_LISTINGS = [
    {
        "zpid": "1001",
        "displayAddress": "123 Main St",
        "address": {"city": "Austin", "state": "TX", "zipcode": "78701"},
        "priceRaw": 350000,
        "beds": 3,
        "baths": 2,
        "livingArea": 1800,
        "homeType": "SingleFamily",
    },
    {
        "zpid": "1002",
        "displayAddress": "456 Oak Ave",
        "address": {"city": "Dallas", "state": "TX", "zipcode": "75201"},
        "priceRaw": 500000,
        "beds": 4,
        "baths": 3,
        "livingArea": 2500,
        "homeType": "SingleFamily",
    },
    {
        "zpid": "1003",
        "displayAddress": "789 Pine Rd",
        "address": {"city": "Houston", "state": "TX", "zipcode": "77001"},
        "priceRaw": 275000,
        "beds": 2,
        "baths": 1,
        "livingArea": 1200,
        "homeType": "Townhouse",
    },
]


class TestFilterListings:
    """Tests for filter_listings function."""

    def test_no_filters_returns_all(self):
        """No filters should return all listings."""
        result = filter_listings(SAMPLE_LISTINGS)
        assert len(result) == 3

    def test_filter_by_max_price(self):
        """Should filter by maximum price."""
        result = filter_listings(SAMPLE_LISTINGS, max_price=400000)
        assert len(result) == 2
        assert all(l["priceRaw"] <= 400000 for l in result)

    def test_filter_by_min_price(self):
        """Should filter by minimum price."""
        result = filter_listings(SAMPLE_LISTINGS, min_price=300000)
        assert len(result) == 2
        assert all(l["priceRaw"] >= 300000 for l in result)

    def test_filter_by_beds_min(self):
        """Should filter by minimum beds."""
        result = filter_listings(SAMPLE_LISTINGS, beds_min=3)
        assert len(result) == 2
        assert all(l["beds"] >= 3 for l in result)

    def test_filter_by_baths_min(self):
        """Should filter by minimum baths."""
        result = filter_listings(SAMPLE_LISTINGS, baths_min=2)
        assert len(result) == 2
        assert all(l["baths"] >= 2 for l in result)

    def test_filter_by_location(self):
        """Should filter by location (city)."""
        result = filter_listings(SAMPLE_LISTINGS, location="Austin")
        assert len(result) == 1
        assert result[0]["zpid"] == "1001"

    def test_filter_by_state(self):
        """Should filter by state."""
        result = filter_listings(SAMPLE_LISTINGS, location="TX")
        assert len(result) == 3  # All are in TX

    def test_combined_filters(self):
        """Should apply multiple filters together."""
        result = filter_listings(
            SAMPLE_LISTINGS,
            min_price=300000,
            beds_min=3,
        )
        assert len(result) == 2


class TestSortListings:
    """Tests for sort_listings function."""

    def test_sort_price_low_high(self):
        """Should sort by price ascending."""
        result = sort_listings(SAMPLE_LISTINGS, "priceLowHigh", randomize=False)
        prices = [l["priceRaw"] for l in result]
        assert prices == sorted(prices)

    def test_sort_price_high_low(self):
        """Should sort by price descending."""
        result = sort_listings(SAMPLE_LISTINGS, "priceHighLow", randomize=False)
        prices = [l["priceRaw"] for l in result]
        assert prices == sorted(prices, reverse=True)

    def test_sort_beds_high_low(self):
        """Should sort by beds descending."""
        result = sort_listings(SAMPLE_LISTINGS, "bedsHighLow", randomize=False)
        beds = [l["beds"] for l in result]
        assert beds == sorted(beds, reverse=True)


class TestFormatListingOutput:
    """Tests for format_listing_output function."""

    def test_formats_basic_fields(self):
        """Should format basic listing fields."""
        listing = SAMPLE_LISTINGS[0]
        result = format_listing_output(listing)

        assert result["zpid"] == "1001"
        assert result["price"] == 350000
        assert result["beds"] == 3
        assert result["baths"] == 2
        assert result["area"] == 1800
        assert "Austin" in result["address"]


class TestZillowPropertySearch:
    """Tests for zillow_property_search tool."""

    def test_returns_expected_structure(self):
        """Should return expected response structure."""
        result = zillow_property_search.invoke({"location": "Texas", "limit": 5})

        assert "location" in result
        assert "appliedFilters" in result
        assert "totalAvailable" in result
        assert "returnedCount" in result
        assert "listings" in result
        assert isinstance(result["listings"], list)

    def test_respects_limit(self):
        """Should respect the limit parameter."""
        result = zillow_property_search.invoke({"limit": 2})
        assert result["returnedCount"] <= 2

    def test_applies_filters(self):
        """Should apply filters correctly."""
        result = zillow_property_search.invoke({"bedsMin": 3})
        assert result["appliedFilters"]["bedsMin"] == 3
