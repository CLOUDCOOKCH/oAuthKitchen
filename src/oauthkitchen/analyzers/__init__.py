"""Analyzers for OAuth security assessment."""

from oauthkitchen.analyzers.translator import PermissionTranslator
from oauthkitchen.analyzers.scoring import RiskScorer
from oauthkitchen.analyzers.shadow import ShadowOAuthDetector

__all__ = [
    "PermissionTranslator",
    "RiskScorer",
    "ShadowOAuthDetector",
]