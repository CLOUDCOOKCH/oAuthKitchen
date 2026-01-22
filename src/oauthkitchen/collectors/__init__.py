"""Data collectors for Microsoft Graph entities."""

from oauthkitchen.collectors.base import BaseCollector
from oauthkitchen.collectors.applications import ApplicationCollector
from oauthkitchen.collectors.service_principals import ServicePrincipalCollector
from oauthkitchen.collectors.permissions import PermissionCollector
from oauthkitchen.collectors.orchestrator import DataOrchestrator

__all__ = [
    "BaseCollector",
    "ApplicationCollector",
    "ServicePrincipalCollector",
    "PermissionCollector",
    "DataOrchestrator",
]