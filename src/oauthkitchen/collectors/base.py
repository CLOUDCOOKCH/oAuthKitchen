"""Base collector class for Graph API data collection."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, TypeVar, Generic

from oauthkitchen.config import Config
from oauthkitchen.graph_client import GraphClient
from oauthkitchen.utils.logging import get_logger

T = TypeVar("T")


class BaseCollector(ABC, Generic[T]):
    """
    Abstract base class for data collectors.

    Provides common functionality for collecting data from Microsoft Graph.
    """

    def __init__(self, client: GraphClient, config: Config):
        """
        Initialize the collector.

        Args:
            client: Authenticated Graph client
            config: Configuration object
        """
        self.client = client
        self.config = config
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def collect(self) -> list[T]:
        """
        Collect all entities of this type.

        Returns:
            List of collected entities
        """
        pass

    @abstractmethod
    def collect_one(self, object_id: str) -> T | None:
        """
        Collect a single entity by ID.

        Args:
            object_id: Object ID of the entity

        Returns:
            The entity or None if not found
        """
        pass

    def _parse_datetime(self, value: Any) -> Any:
        """Parse a datetime string from Graph API."""
        if not value:
            return None

        from datetime import datetime
        from dateutil import parser

        if isinstance(value, datetime):
            return value

        try:
            return parser.isoparse(value)
        except (ValueError, TypeError):
            self.logger.warning("Failed to parse datetime: %s", value)
            return None

    def _safe_get(self, data: dict[str, Any], *keys: str, default: Any = None) -> Any:
        """Safely get a nested value from a dictionary."""
        current = data
        for key in keys:
            if not isinstance(current, dict):
                return default
            current = current.get(key, default)
            if current is None:
                return default
        return current