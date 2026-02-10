"""Test for forwardedProps."""

import pytest
from app.utils.context_extractor import (
    FilterHints,
    ListingHints,
    RuntimeContext,
    extract_runtime_context,
    format_filter_summary,
    format_listing_hints,
)


class TestExtractRuntimeContext:
    """Tests for extract_runtime_context function."""

    def test_empty_props_returns_defaults(self):
        """Empty or None props should return default RuntimeContext."""
        result = extract_runtime_context(None)
        assert result.sender_uid == "unknown"
        assert result.sender_role == "unspecified"
        assert result.listing_hints.zpid is None

    def test_extracts_sender_info(self):
        """Should extract sender UID and role from cometchatContext."""
        props = {
            "cometchatContext": {
                "sender": {"uid": "user-123", "role": "admin", "name": "John"}
            }
        }
        result = extract_runtime_context(props)
        assert result.sender_uid == "user-123"
        assert result.sender_role == "admin"
        assert result.sender_name == "John"

    def test_extracts_zpid_from_metadata(self):
        """Should extract zpid from messageMetadata."""
        props = {
            "cometchatContext": {
                "sender": {"uid": "user-1"},
                "messageMetadata": {"zpid": "12345678"}
            }
        }
        result = extract_runtime_context(props)
        assert result.listing_hints.zpid == "12345678"

    def test_extracts_zpid_from_nested_context(self):
        """Should extract zpid from nested context.listing structure."""
        props = {
            "cometchatContext": {
                "sender": {"uid": "user-1"},
                "messageMetadata": {
                    "context": {
                        "listing": {"zpid": "87654321"}
                    }
                }
            }
        }
        result = extract_runtime_context(props)
        assert result.listing_hints.zpid == "87654321"

    def test_extracts_filter_hints(self):
        """Should extract filter hints from metadata."""
        props = {
            "cometchatContext": {
                "sender": {"uid": "user-1"},
                "messageMetadata": {
                    "filters": {
                        "minPrice": 200000,
                        "maxPrice": 500000,
                        "bedsMin": 3,
                        "bathsMin": 2
                    }
                }
            }
        }
        result = extract_runtime_context(props)
        assert result.filter_hints.minPrice == 200000
        assert result.filter_hints.maxPrice == 500000
        assert result.filter_hints.bedsMin == 3
        assert result.filter_hints.bathsMin == 2

    def test_extracts_detail_url(self):
        """Should extract detailUrl from metadata."""
        props = {
            "cometchatContext": {
                "sender": {"uid": "user-1"},
                "messageMetadata": {
                    "detailUrl": "/homedetails/123-Main-St/12345_zpid"
                }
            }
        }
        result = extract_runtime_context(props)
        assert result.listing_hints.detailUrl == "/homedetails/123-Main-St/12345_zpid"


class TestFormatFilterSummary:
    """Tests for format_filter_summary function."""

    def test_empty_hints_returns_none_detected(self):
        """Empty hints should return 'none detected'."""
        hints = FilterHints()
        assert format_filter_summary(hints) == "none detected"

    def test_formats_price_range(self):
        """Should format price range correctly."""
        hints = FilterHints(minPrice=200000, maxPrice=500000)
        result = format_filter_summary(hints)
        assert "price $200,000 – $500,000" in result

    def test_formats_beds_and_baths(self):
        """Should format beds and baths filters."""
        hints = FilterHints(bedsMin=3, bathsMin=2)
        result = format_filter_summary(hints)
        assert "bedsMin>=3" in result
        assert "bathsMin>=2" in result

    def test_formats_home_types(self):
        """Should format home types."""
        hints = FilterHints(homeTypes=["SingleFamily", "Townhouse"])
        result = format_filter_summary(hints)
        assert "homeTypes=SingleFamily/Townhouse" in result


class TestFormatListingHints:
    """Tests for format_listing_hints function."""

    def test_empty_hints_returns_none_detected(self):
        """Empty hints should return 'none detected'."""
        hints = ListingHints()
        assert format_listing_hints(hints) == "none detected"

    def test_formats_zpid(self):
        """Should format zpid."""
        hints = ListingHints(zpid="12345678")
        result = format_listing_hints(hints)
        assert "zpid 12345678" in result

    def test_formats_multiple_hints(self):
        """Should format multiple hints with separator."""
        hints = ListingHints(zpid="12345678", address="123 Main St")
        result = format_listing_hints(hints)
        assert "zpid 12345678" in result
        assert "123 Main St" in result
        assert "|" in result
