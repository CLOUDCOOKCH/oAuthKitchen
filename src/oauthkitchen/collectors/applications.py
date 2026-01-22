"""Collector for Application (app registration) objects."""

from __future__ import annotations

from typing import Any

from oauthkitchen.collectors.base import BaseCollector
from oauthkitchen.models import Application, Credential, CredentialType, Owner


class ApplicationCollector(BaseCollector[Application]):
    """
    Collects Application objects (app registrations) from Microsoft Graph.

    App registrations define what an app can do across tenants.
    The actual permissions are granted via ServicePrincipal objects.
    """

    ENDPOINT = "applications"
    SELECT_FIELDS = [
        "id",
        "appId",
        "displayName",
        "createdDateTime",
        "publisherDomain",
        "verifiedPublisher",
        "signInAudience",
        "passwordCredentials",
        "keyCredentials",
        "requiredResourceAccess",
        "notes",
        "tags",
    ]

    def collect(self) -> list[Application]:
        """Collect all applications in the tenant."""
        self.logger.info("Collecting applications...")

        applications = []
        select = ",".join(self.SELECT_FIELDS)

        for data in self.client.get_all_pages(
            self.ENDPOINT,
            params={"$select": select}
        ):
            app = self._parse_application(data)
            if app:
                applications.append(app)

        self.logger.info("Collected %d applications", len(applications))
        return applications

    def collect_one(self, object_id: str) -> Application | None:
        """Collect a single application by object ID."""
        select = ",".join(self.SELECT_FIELDS)
        response = self.client.get(
            f"{self.ENDPOINT}/{object_id}",
            params={"$select": select}
        )

        if response.status_code != 200 or not response.data:
            self.logger.warning(
                "Failed to fetch application %s: %s",
                object_id,
                response.error
            )
            return None

        return self._parse_application(response.data)

    def collect_owners(self, object_id: str) -> list[Owner]:
        """Collect owners of an application."""
        owners = []

        for data in self.client.get_all_pages(
            f"{self.ENDPOINT}/{object_id}/owners",
            params={"$select": "id,displayName,userPrincipalName,@odata.type"}
        ):
            owner = self._parse_owner(data)
            if owner:
                owners.append(owner)

        return owners

    def _parse_application(self, data: dict[str, Any]) -> Application | None:
        """Parse an application from Graph API response."""
        try:
            # Parse sign-in audience to determine multi-tenant
            sign_in_audience = data.get("signInAudience", "")
            is_multi_tenant = sign_in_audience in [
                "AzureADMultipleOrgs",
                "AzureADandPersonalMicrosoftAccount",
                "PersonalMicrosoftAccount",
            ]

            app = Application(
                object_id=data["id"],
                app_id=data.get("appId", ""),
                display_name=data.get("displayName", "Unknown"),
                created_datetime=self._parse_datetime(data.get("createdDateTime")),
                publisher_domain=data.get("publisherDomain"),
                verified_publisher=data.get("verifiedPublisher"),
                sign_in_audience=sign_in_audience,
                is_multi_tenant=is_multi_tenant,
                password_credentials=self._parse_credentials(
                    data.get("passwordCredentials", []),
                    CredentialType.PASSWORD
                ),
                key_credentials=self._parse_credentials(
                    data.get("keyCredentials", []),
                    CredentialType.CERTIFICATE
                ),
                required_resource_access=data.get("requiredResourceAccess", []),
                notes=data.get("notes"),
                tags=data.get("tags", []),
            )

            return app

        except KeyError as e:
            self.logger.warning("Failed to parse application: missing field %s", e)
            return None

    def _parse_credentials(
        self,
        credentials: list[dict[str, Any]],
        cred_type: CredentialType
    ) -> list[Credential]:
        """Parse credential list from Graph API response."""
        result = []

        for cred_data in credentials:
            try:
                cred = Credential(
                    credential_id=cred_data.get("keyId", ""),
                    credential_type=cred_type,
                    display_name=cred_data.get("displayName"),
                    start_datetime=self._parse_datetime(cred_data.get("startDateTime")),
                    end_datetime=self._parse_datetime(cred_data.get("endDateTime")),
                    key_id=cred_data.get("keyId"),
                )
                result.append(cred)
            except (KeyError, ValueError) as e:
                self.logger.debug("Skipping credential: %s", e)

        return result

    def _parse_owner(self, data: dict[str, Any]) -> Owner | None:
        """Parse an owner from Graph API response."""
        try:
            # Determine object type from @odata.type
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