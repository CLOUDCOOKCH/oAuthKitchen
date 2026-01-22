"""Collector for ServicePrincipal (enterprise app) objects."""

from __future__ import annotations

from typing import Any

from oauthkitchen.collectors.base import BaseCollector
from oauthkitchen.models import (
    ServicePrincipal,
    Owner,
    AppType,
    SignInActivity,
)

# Well-known Microsoft first-party publisher ID
MICROSOFT_PUBLISHER_ID = "f8cdef31-a31e-4b4a-93e4-5f571e91255a"

# Well-known Microsoft tenant ID (used for first-party apps)
MICROSOFT_TENANT_ID = "72f988bf-86f1-41af-91ab-2d7cd011db47"


class ServicePrincipalCollector(BaseCollector[ServicePrincipal]):
    """
    Collects ServicePrincipal objects (enterprise apps) from Microsoft Graph.

    Enterprise apps represent the instantiation of an application in a tenant.
    They hold the actual permission grants.
    """

    ENDPOINT = "servicePrincipals"
    SELECT_FIELDS = [
        "id",
        "appId",
        "displayName",
        "createdDateTime",
        "servicePrincipalType",
        "publisherName",
        "verifiedPublisher",
        "appOwnerOrganizationId",
        "accountEnabled",
        "tags",
    ]

    def __init__(self, *args: Any, tenant_id: str = "", **kwargs: Any):
        """Initialize with optional tenant ID for ownership detection."""
        super().__init__(*args, **kwargs)
        self.tenant_id = tenant_id

    def collect(self) -> list[ServicePrincipal]:
        """Collect all service principals in the tenant."""
        self.logger.info("Collecting service principals...")

        service_principals = []
        select = ",".join(self.SELECT_FIELDS)

        for data in self.client.get_all_pages(
            self.ENDPOINT,
            params={"$select": select}
        ):
            sp = self._parse_service_principal(data)
            if sp:
                service_principals.append(sp)

        self.logger.info("Collected %d service principals", len(service_principals))
        return service_principals

    def collect_one(self, object_id: str) -> ServicePrincipal | None:
        """Collect a single service principal by object ID."""
        select = ",".join(self.SELECT_FIELDS)
        response = self.client.get(
            f"{self.ENDPOINT}/{object_id}",
            params={"$select": select}
        )

        if response.status_code != 200 or not response.data:
            self.logger.warning(
                "Failed to fetch service principal %s: %s",
                object_id,
                response.error
            )
            return None

        return self._parse_service_principal(response.data)

    def collect_by_app_id(self, app_id: str) -> ServicePrincipal | None:
        """Collect a service principal by its app ID (client ID)."""
        response = self.client.get(
            self.ENDPOINT,
            params={
                "$filter": f"appId eq '{app_id}'",
                "$select": ",".join(self.SELECT_FIELDS)
            }
        )

        if response.status_code != 200 or not response.data:
            return None

        values = response.data.get("value", [])
        if values:
            return self._parse_service_principal(values[0])
        return None

    def collect_owners(self, object_id: str) -> list[Owner]:
        """Collect owners of a service principal."""
        owners = []

        for data in self.client.get_all_pages(
            f"{self.ENDPOINT}/{object_id}/owners",
            params={"$select": "id,displayName,userPrincipalName,@odata.type"}
        ):
            owner = self._parse_owner(data)
            if owner:
                owners.append(owner)

        return owners

    def collect_sign_in_activity(self, object_id: str) -> SignInActivity | None:
        """
        Collect sign-in activity for a service principal.

        Note: This requires AuditLog.Read.All permission and may require
        Azure AD P1/P2 license for full data.
        """
        if not self.client.sign_in_logs_available:
            return SignInActivity(
                last_sign_in_datetime=None,
                last_non_interactive_sign_in_datetime=None,
                last_successful_sign_in_datetime=None,
                data_available=False
            )

        # Try beta API for sign-in activity
        response = self.client.get(
            f"{self.ENDPOINT}/{object_id}",
            params={"$select": "signInActivity"},
            use_beta=True
        )

        if response.status_code != 200 or not response.data:
            return SignInActivity(
                last_sign_in_datetime=None,
                last_non_interactive_sign_in_datetime=None,
                last_successful_sign_in_datetime=None,
                data_available=False
            )

        activity_data = response.data.get("signInActivity", {})

        return SignInActivity(
            last_sign_in_datetime=self._parse_datetime(
                activity_data.get("lastSignInDateTime")
            ),
            last_non_interactive_sign_in_datetime=self._parse_datetime(
                activity_data.get("lastNonInteractiveSignInDateTime")
            ),
            last_successful_sign_in_datetime=self._parse_datetime(
                activity_data.get("lastSuccessfulSignInDateTime")
            ),
            data_available=True
        )

    def _parse_service_principal(self, data: dict[str, Any]) -> ServicePrincipal | None:
        """Parse a service principal from Graph API response."""
        try:
            app_owner_org_id = data.get("appOwnerOrganizationId")
            app_type = self._classify_app_type(data, app_owner_org_id)

            sp = ServicePrincipal(
                object_id=data["id"],
                app_id=data.get("appId", ""),
                display_name=data.get("displayName", "Unknown"),
                created_datetime=self._parse_datetime(data.get("createdDateTime")),
                service_principal_type=data.get("servicePrincipalType"),
                app_type=app_type,
                publisher_name=data.get("publisherName"),
                verified_publisher=data.get("verifiedPublisher"),
                app_owner_organization_id=app_owner_org_id,
                account_enabled=data.get("accountEnabled", True),
                tags=data.get("tags", []),
            )

            return sp

        except KeyError as e:
            self.logger.warning(
                "Failed to parse service principal: missing field %s", e
            )
            return None

    def _classify_app_type(
        self,
        data: dict[str, Any],
        app_owner_org_id: str | None
    ) -> AppType:
        """
        Classify the app type based on available signals.

        This uses heuristics rather than hardcoded app ID lists.
        """
        # Check for Microsoft first-party apps
        verified_publisher = data.get("verifiedPublisher", {})
        if verified_publisher:
            publisher_id = verified_publisher.get("verifiedPublisherId")
            if publisher_id == MICROSOFT_PUBLISHER_ID:
                return AppType.FIRST_PARTY_MICROSOFT

        # Check if owned by Microsoft tenant
        if app_owner_org_id == MICROSOFT_TENANT_ID:
            return AppType.FIRST_PARTY_MICROSOFT

        # Check publisher name for Microsoft
        publisher_name = data.get("publisherName", "")
        if publisher_name and "Microsoft" in publisher_name:
            # Could be Microsoft but not definitive
            # We mark as first-party only with strong signals
            pass

        # Check if owned by current tenant
        if self.tenant_id and app_owner_org_id == self.tenant_id:
            return AppType.TENANT_OWNED

        # Check if it's a multi-tenant app (not owned by this tenant)
        if app_owner_org_id and app_owner_org_id != self.tenant_id:
            return AppType.THIRD_PARTY_MULTI_TENANT

        # Unknown/external
        return AppType.EXTERNAL_UNKNOWN

    def _parse_owner(self, data: dict[str, Any]) -> Owner | None:
        """Parse an owner from Graph API response."""
        try:
            odata_type = data.get("@odata.type", "")
            if "user" in odata_type.lower():
                object_type = "user"
            elif "serviceprincipal" in odata_type.lower():
                object_type = "servicePrincipal"
            else:
                object_type = "unknown"

            return Owner(
                object_id=data["id"],
                display_name=data.get("displayName"),
                user_principal_name=data.get("userPrincipalName"),
                object_type=object_type,
            )

        except KeyError as e:
            self.logger.debug("Failed to parse owner: %s", e)
            return None