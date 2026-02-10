"""Working memory manager for filter persistence."""

import json
import sqlite3
import threading
from datetime import datetime
from typing import Any

from .utils.context_extractor import FilterHints


class WorkingMemoryManager:
    """Manages working memory for filter persistence across conversation turns."""

    def __init__(self, db_path: str = ":memory:"):
        """
        Initialize the working memory manager.

        Args:
            db_path: Path to SQLite database. Use ":memory:" for in-memory storage.
        """
        self.db_path = db_path
        self._local = threading.local()
        self._init_schema()

    def _get_conn(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        return self._local.conn

    def _init_schema(self) -> None:
        """Initialize the database schema."""
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS working_memory (
                thread_id TEXT PRIMARY KEY,
                filters TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.commit()

    def get_filters(self, thread_id: str) -> FilterHints | None:
        """
        Get stored filters for a thread.

        Args:
            thread_id: The thread identifier.

        Returns:
            FilterHints if found, None otherwise.
        """
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT filters FROM working_memory WHERE thread_id = ?", (thread_id,)
        )
        row = cursor.fetchone()

        if not row:
            return None

        try:
            data = json.loads(row[0])
            return FilterHints(
                location=data.get("location") or data.get("query"),
                minPrice=data.get("minPrice") or data.get("min_price"),
                maxPrice=data.get("maxPrice") or data.get("max_price"),
                bedsMin=data.get("bedsMin") or data.get("beds_min"),
                bedsMax=data.get("bedsMax") or data.get("beds_max"),
                bathsMin=data.get("bathsMin") or data.get("baths_min"),
                bathsMax=data.get("bathsMax") or data.get("baths_max"),
                sqftMax=data.get("sqftMax") or data.get("sqft_max"),
                sortOrder=data.get("sortOrder") or data.get("sort_order"),
                homeTypes=data.get("homeTypes") or data.get("home_types"),
                limit=data.get("limit"),
                randomize=data.get("randomize"),
            )
        except (json.JSONDecodeError, TypeError):
            return None

    def save_filters(self, thread_id: str, filters: FilterHints) -> None:
        """
        Save filters for a thread.

        Args:
            thread_id: The thread identifier.
            filters: The filters to save.
        """
        conn = self._get_conn()

        data = {
            "location": filters.location,
            "query": filters.location,  # Alias
            "minPrice": filters.minPrice,
            "maxPrice": filters.maxPrice,
            "bedsMin": filters.bedsMin,
            "bedsMax": filters.bedsMax,
            "bathsMin": filters.bathsMin,
            "bathsMax": filters.bathsMax,
            "sqftMax": filters.sqftMax,
            "sortOrder": filters.sortOrder,
            "homeTypes": filters.homeTypes,
            "limit": filters.limit,
            "randomize": filters.randomize,
        }

        conn.execute(
            """
            INSERT OR REPLACE INTO working_memory (thread_id, filters, updated_at)
            VALUES (?, ?, ?)
            """,
            (thread_id, json.dumps(data), datetime.utcnow().isoformat()),
        )
        conn.commit()

    def merge_filters(
        self,
        thread_id: str,
        explicit_filters: FilterHints,
        context_filters: FilterHints | None = None,
    ) -> FilterHints:
        """
        Merge filters with priority: explicit > context > working memory.

        Args:
            thread_id: The thread identifier.
            explicit_filters: Filters explicitly provided in the request.
            context_filters: Filters extracted from context.

        Returns:
            Merged FilterHints.
        """

        stored = self.get_filters(thread_id) or FilterHints()

        # Merge: explicit > context > stored
        def pick(explicit: Any, context: Any, stored: Any) -> Any:
            if explicit is not None:
                return explicit
            if context is not None:
                return context
            return stored

        ctx = context_filters or FilterHints()

        merged = FilterHints(
            location=pick(explicit_filters.location, ctx.location, stored.location),
            minPrice=pick(explicit_filters.minPrice, ctx.minPrice, stored.minPrice),
            maxPrice=pick(explicit_filters.maxPrice, ctx.maxPrice, stored.maxPrice),
            bedsMin=pick(explicit_filters.bedsMin, ctx.bedsMin, stored.bedsMin),
            bedsMax=pick(explicit_filters.bedsMax, ctx.bedsMax, stored.bedsMax),
            bathsMin=pick(explicit_filters.bathsMin, ctx.bathsMin, stored.bathsMin),
            bathsMax=pick(explicit_filters.bathsMax, ctx.bathsMax, stored.bathsMax),
            sqftMax=pick(explicit_filters.sqftMax, ctx.sqftMax, stored.sqftMax),
            sortOrder=pick(explicit_filters.sortOrder, ctx.sortOrder, stored.sortOrder),
            homeTypes=pick(explicit_filters.homeTypes, ctx.homeTypes, stored.homeTypes),
            limit=pick(explicit_filters.limit, ctx.limit, stored.limit),
            randomize=pick(explicit_filters.randomize, ctx.randomize, stored.randomize),
        )

        return merged

    def delete_filters(self, thread_id: str) -> None:
        """
        Delete filters for a thread.

        Args:
            thread_id: The thread identifier.
        """
        conn = self._get_conn()
        conn.execute("DELETE FROM working_memory WHERE thread_id = ?", (thread_id,))
        conn.commit()

    def close(self) -> None:
        """Close the database connection."""
        if hasattr(self._local, "conn") and self._local.conn:
            self._local.conn.close()
            self._local.conn = None


_memory_manager: WorkingMemoryManager | None = None


def get_memory_manager(db_path: str = ":memory:") -> WorkingMemoryManager:
    """Get or create the global memory manager."""
    global _memory_manager
    if _memory_manager is None:
        _memory_manager = WorkingMemoryManager(db_path)
    return _memory_manager


def reset_memory_manager() -> None:
    """Reset the global memory manager (useful for testing)."""
    global _memory_manager
    if _memory_manager:
        _memory_manager.close()
    _memory_manager = None
