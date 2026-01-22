"""
OAuthKitchen - OAuth Security Analysis Tool for Microsoft Entra ID

A comprehensive tool for analyzing OAuth application consent, detecting shadow OAuth exposure,
and translating permissions into plain-English security impact assessments.
"""

__version__ = "0.1.0"
__author__ = "OAuthKitchen Contributors"

from oauthkitchen.models import (
    Application,
    ServicePrincipal,
    OAuth2PermissionGrant,
    AppRoleAssignment,
    Credential,
    Owner,
    RiskScore,
    AnalysisResult,
)

__all__ = [
    "__version__",
    "Application",
    "ServicePrincipal",
    "OAuth2PermissionGrant",
    "AppRoleAssignment",
    "Credential",
    "Owner",
    "RiskScore",
    "AnalysisResult",
]


def main() -> None:
    """Entry point for the CLI."""
    from oauthkitchen.cli import app
    app()
