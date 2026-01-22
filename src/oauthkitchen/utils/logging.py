"""Logging configuration for OAuthKitchen."""

import logging
import sys
from typing import Optional


_LOGGER_NAME = "oauthkitchen"


def setup_logging(level: str = "INFO", verbose: bool = False) -> logging.Logger:
    """
    Configure logging for OAuthKitchen.

    Args:
        level: Log level (DEBUG, INFO, WARNING, ERROR)
        verbose: If True, enables DEBUG level regardless of level param
    """
    logger = logging.getLogger(_LOGGER_NAME)

    if verbose:
        level = "DEBUG"

    logger.setLevel(getattr(logging, level.upper(), logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setLevel(logging.DEBUG)

        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    Get a logger instance.

    Args:
        name: Optional sub-logger name (will be prefixed with oauthkitchen.)
    """
    if name:
        return logging.getLogger(f"{_LOGGER_NAME}.{name}")
    return logging.getLogger(_LOGGER_NAME)