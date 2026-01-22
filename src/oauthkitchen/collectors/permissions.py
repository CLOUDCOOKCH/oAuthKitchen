"""Collector for OAuth2PermissionGrants and AppRoleAssignments."""

from __future__ import annotations

from typing import Any

from oauthkitchen.collectors.base import BaseCollector
from oauthkitchen.config import Config
from oauthkitchen.graph_client import GraphClient
from oauthkitchen.models import (
    OAuth2PermissionGrant,
    AppRoleAssignment,
    ConsentType,
)


class PermissionCollector(BaseCollector[OAuth2PermissionGrant]):
    """
    Collects permission grants and assignments from Microsoft Graph.

    This collector handles:
    - oauth2PermissionGrants: Delegated permission grants
    - appRoleAssignments: Application permission assignments
    """

    def __init__(
        self,
        client: GraphClient,
        config: Config,
        resource_sp_map: dict[str, str] | None = None
    ):
        """
        Initialize the collector.

        Args:
            client: Graph client
            config: Configuration
            resource_sp_map: Mapping of resource SP object IDs to display names
        """
        super().__init__(client, config)
        self.resource_sp_map = resource_sp_map or {}
        self._app_roles_cache: dict[str, dict[str, dict[str, Any]]] = {}

    def collect(self) -> list[OAuth2PermissionGrant]:
        """Collect all OAuth2PermissionGrants in the tenant."""
        self.logger.info("Collecting OAuth2 permission grants...")

        grants = []

        for data in self.client.get_all_pages("oauth2PermissionGrants"):
            grant = self._parse_permission_grant(data)
            if grant:
                grants.append(grant)

        self.logger.info("Collected %d permission grants", len(grants))
        return grants

    def collect_one(self, object_id: str) -> OAuth2PermissionGrant | None:
        """Collect a single permission grant by ID."""
        response = self.client.get(f"oauth2PermissionGrants/{object_id}")

        if response.status_code != 200 or not response.data:
            return None

        return self._parse_permission_grant(response.data)

    def collect_grants_for_client(
        self,
        client_sp_id: str
    ) -> list[OAuth2PermissionGrant]:
        """Collect all delegated grants for a specific client service principal."""
        grants = []

        response = self.client.get(
            "oauth2PermissionGrants",
            params={"$filter": f"clientId eq '{client_sp_id}'"}
        )

        if response.status_code == 200 and response.data:
            for data in response.data.get("value", []):
                grant = self._parse_permission_grant(data)
                if grant:
                    grants.append(grant)

        return grants

    def collect_app_role_assignments(
        self,
        sp_object_id: str
    ) -> list[AppRoleAssignment]:
        """
        Collect all app role assignments for a service principal.

        These represent application (not delegated) permissions.
        """
        assignments = []

        for data in self.client.get_all_pages(
            f"servicePrincipals/{sp_object_id}/appRoleAssignments"
        ):
            assignment = self._parse_app_role_assignment(data)
            if assignment:
                # Try to resolve the role value
                self._resolve_app_role(assignment)
                assignments.append(assignment)

        return assignments

    def collect_all_app_role_assignments(self) -> list[AppRoleAssignment]:
        """
        Collect all app role assignments across all service principals.

        Note: This can be expensive for large tenants.
        Consider using collect_app_role_assignments for specific SPs.
        """
        self.logger.info("Collecting all app role assignments...")

        assignments = []

        # Get all service principals first
        for sp_data in self.client.get_all_pages(
            "servicePrincipals",
            params={"$select": "id"}
        ):
            sp_id = sp_data.get("id")
            if sp_id:
                sp_assignments = self.collect_app_role_assignments(sp_id)
                assignments.extend(sp_assignments)

        self.logger.info("Collected %d app role assignments", len(assignments))
        return assignments

    def get_resource_app_roles(
        self,
        resource_sp_id: str
    ) -> dict[str, dict[str, Any]]:
        """
        Get app roles defined by a resource service principal.

        Returns a dict mapping app role ID to role details.
        """
        if resource_sp_id in self._app_roles_cache:
            return self._app_roles_cache[resource_sp_id]

        response = self.client.get(
            f"servicePrincipals/{resource_sp_id}",
            params={"$select": "appRoles"}
        )

        roles = {}
        if response.status_code == 200 and response.data:
            for role in response.data.get("appRoles", []):
                role_id = role.get("id")
                if role_id:
                    roles[role_id] = {
                        "value": role.get("value"),
                        "displayName": role.get("displayName"),
                        "description": role.get("description"),
                    }

        self._app_roles_cache[resource_sp_id] = roles
        return roles

    def _parse_permission_grant(
        self,
        data: dict[str, Any]
    ) -> OAuth2PermissionGrant | None:
        """Parse an OAuth2PermissionGrant from Graph API response."""
        try:
            # Determine consent type
            consent_type_str = data.get("consentType", "")
            if consent_type_str == "AllPrincipals":
                consent_type = ConsentType.ADMIN
            elif consent_type_str == "Principal":
                consent_type = ConsentType.USER
            else:
                consent_type = ConsentType.UNKNOWN

            return OAuth2PermissionGrant(
                id=data["id"],
                client_id=data.get("clientId", ""),
                consent_type=consent_type,
                principal_id=data.get("principalId"),  # None for admin consent
                resource_id=data.get("resourceId", ""),
                scope=data.get("scope", ""),
                start_time=self._parse_datetime(data.get("startTime")),
                expiry_time=self._parse_datetime(data.get("expiryTime")),
            )

        except KeyError as e:
            self.logger.debug("Failed to parse permission grant: %s", e)
            return None

    def _parse_app_role_assignment(
        self,
        data: dict[str, Any]
    ) -> AppRoleAssignment | None:
        """Parse an AppRoleAssignment from Graph API response."""
        try:
            resource_id = data.get("resourceId", "")

            return AppRoleAssignment(
                id=data["id"],
                app_role_id=data.get("appRoleId", ""),
                principal_id=data.get("principalId", ""),
                principal_type=data.get("principalType", ""),
                resource_id=resource_id,
                resource_display_name=self.resource_sp_map.get(
                    resource_id,
                    data.get("resourceDisplayName")
                ),
                created_datetime=self._parse_datetime(data.get("createdDateTime")),
            )

        except KeyError as e:
            self.logger.debug("Failed to parse app role assignment: %s", e)
            return None

    def _resolve_app_role(self, assignment: AppRoleAssignment) -> None:
        """Resolve the app role value from the resource SP."""
        if not assignment.resource_id or not assignment.app_role_id:
            return

        # Special case: empty GUID means "default access" (no specific role)
        if assignment.app_role_id == "00000000-0000-0000-0000-000000000000":
            assignment.role_value = "Default Access"
            assignment.role_display_name = "Default Access"
            return

        roles = self.get_resource_app_roles(assignment.resource_id)
        role_info = roles.get(assignment.app_role_id)

        if role_info:
            assignment.role_value = role_info.get("value")
            assignment.role_display_name = role_info.get("displayName")