"""Base reporter class."""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from oauthkitchen.config import Config
from oauthkitchen.models import AnalysisResult
from oauthkitchen.utils.logging import get_logger


class BaseReporter(ABC):
    """Base class for report generators."""

    def __init__(self, config: Config, output_dir: Path | str | None = None):
        """
        Initialize the reporter.

        Args:
            config: Configuration object
            output_dir: Output directory (uses config default if not specified)
        """
        self.config = config
        self.output_dir = Path(output_dir or config.output.output_directory)
        self.logger = get_logger(self.__class__.__name__)

    @abstractmethod
    def generate(self, result: AnalysisResult) -> Path:
        """
        Generate the report.

        Args:
            result: Analysis result data

        Returns:
            Path to the generated report file
        """
        pass

    def ensure_output_dir(self) -> Path:
        """Ensure the output directory exists."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        return self.output_dir