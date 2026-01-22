"""In-memory caching for OAuthKitchen."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Generic, TypeVar, Optional

T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    """A single cache entry with TTL."""
    value: T
    created_at: float
    ttl_seconds: int

    @property
    def is_expired(self) -> bool:
        """Check if this entry has expired."""
        return time.time() - self.created_at > self.ttl_seconds


class Cache:
    """
    Simple in-memory cache with optional file persistence.

    Used to avoid repeated Graph API calls during analysis.
    """

    def __init__(
        self,
        ttl_seconds: int = 3600,
        persist_path: Optional[Path] = None
    ):
        """
        Initialize cache.

        Args:
            ttl_seconds: Default TTL for cache entries
            persist_path: Optional path to persist cache to disk
        """
        self._cache: dict[str, CacheEntry[Any]] = {}
        self._ttl_seconds = ttl_seconds
        self._persist_path = persist_path

        if persist_path and persist_path.exists():
            self._load_from_file()

    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from cache.

        Returns None if key doesn't exist or is expired.
        """
        entry = self._cache.get(key)
        if entry is None:
            return None

        if entry.is_expired:
            del self._cache[key]
            return None

        return entry.value

    def set(self, key: str, value: Any, ttl_seconds: Optional[int] = None) -> None:
        """
        Set a value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Optional custom TTL (uses default if not specified)
        """
        self._cache[key] = CacheEntry(
            value=value,
            created_at=time.time(),
            ttl_seconds=ttl_seconds or self._ttl_seconds
        )

    def delete(self, key: str) -> bool:
        """Delete a key from cache. Returns True if key existed."""
        if key in self._cache:
            del self._cache[key]
            return True
        return False

    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed entries."""
        expired_keys = [
            key for key, entry in self._cache.items()
            if entry.is_expired
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)

    def persist(self) -> None:
        """Persist cache to file if path configured."""
        if not self._persist_path:
            return

        self.cleanup_expired()

        data = {
            key: {
                "value": entry.value,
                "created_at": entry.created_at,
                "ttl_seconds": entry.ttl_seconds
            }
            for key, entry in self._cache.items()
        }

        self._persist_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._persist_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=str)

    def _load_from_file(self) -> None:
        """Load cache from file."""
        if not self._persist_path or not self._persist_path.exists():
            return

        try:
            with open(self._persist_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            for key, entry_data in data.items():
                self._cache[key] = CacheEntry(
                    value=entry_data["value"],
                    created_at=entry_data["created_at"],
                    ttl_seconds=entry_data["ttl_seconds"]
                )

            self.cleanup_expired()
        except (json.JSONDecodeError, KeyError):
            self._cache.clear()

    @property
    def size(self) -> int:
        """Number of entries in cache."""
        return len(self._cache)

    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        self.cleanup_expired()
        return {
            "entries": self.size,
            "ttl_seconds": self._ttl_seconds,
            "persist_path": str(self._persist_path) if self._persist_path else None
        }