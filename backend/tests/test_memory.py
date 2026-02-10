"""Tests for working memory manager."""

import pytest
from app.memory import WorkingMemoryManager, FilterHints


class TestWorkingMemoryManager:
    """Tests for WorkingMemoryManager class."""

    @pytest.fixture
    def memory_manager(self):
        """Create a fresh in-memory manager for each test."""
        return WorkingMemoryManager(":memory:")

    def test_get_filters_returns_none_for_new_thread(self, memory_manager):
        """Should return None for a thread with no saved filters."""
        result = memory_manager.get_filters("new-thread")
        assert result is None

    def test_save_and_get_filters(self, memory_manager):
        """Should save and retrieve filters correctly."""
        filters = FilterHints(
            location="Austin, TX",
            minPrice=200000,
            maxPrice=500000,
            bedsMin=3,
        )
        memory_manager.save_filters("thread-1", filters)

        result = memory_manager.get_filters("thread-1")
        assert result is not None
        assert result.location == "Austin, TX"
        assert result.minPrice == 200000
        assert result.maxPrice == 500000
        assert result.bedsMin == 3

    def test_update_existing_filters(self, memory_manager):
        """Should update existing filters."""
        filters1 = FilterHints(minPrice=200000)
        memory_manager.save_filters("thread-1", filters1)

        filters2 = FilterHints(minPrice=300000, bedsMin=4)
        memory_manager.save_filters("thread-1", filters2)

        result = memory_manager.get_filters("thread-1")
        assert result.minPrice == 300000
        assert result.bedsMin == 4

    def test_delete_filters(self, memory_manager):
        """Should delete filters for a thread."""
        filters = FilterHints(minPrice=200000)
        memory_manager.save_filters("thread-1", filters)

        memory_manager.delete_filters("thread-1")

        result = memory_manager.get_filters("thread-1")
        assert result is None

    def test_merge_filters_priority(self, memory_manager):
        """Should merge filters with correct priority: explicit > context > stored."""
        # Save some filters
        stored = FilterHints(minPrice=100000, bedsMin=2)
        memory_manager.save_filters("thread-1", stored)

        # Context filters
        context = FilterHints(minPrice=200000, maxPrice=500000)

        # Explicit filters
        explicit = FilterHints(minPrice=300000)

        result = memory_manager.merge_filters("thread-1", explicit, context)

        # Explicit wins for minPrice
        assert result.minPrice == 300000
        # Context wins for maxPrice (explicit is None)
        assert result.maxPrice == 500000
        # Stored wins for bedsMin (explicit and context are None)
        assert result.bedsMin == 2

    def test_separate_threads_isolated(self, memory_manager):
        """Different threads should have isolated filters."""
        filters1 = FilterHints(location="Austin")
        filters2 = FilterHints(location="Dallas")

        memory_manager.save_filters("thread-1", filters1)
        memory_manager.save_filters("thread-2", filters2)

        result1 = memory_manager.get_filters("thread-1")
        result2 = memory_manager.get_filters("thread-2")

        assert result1.location == "Austin"
        assert result2.location == "Dallas"
