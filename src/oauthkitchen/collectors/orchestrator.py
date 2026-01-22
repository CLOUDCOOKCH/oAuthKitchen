"""Data collection orchestrator that coordinates all collectors."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from oauthkitchen.collectors.applications import ApplicationCollector
from oauthkitchen.collectors.permissions import PermissionCollector
from oauthkitchen.collectors.service_principals import ServicePrincipalCollector
from oauthkitchen.config import Config
from oauthkitchen.graph_client import GraphClient
from oauthkitchen.models import (
    AnalysisResult,
    Application,
    ServicePrincipal,
    CredentialExpiryFinding,
    CredentialType,
)
from oauthkitchen.utils.logging import get_logger

logger = get_logger("orchestrator")


class DataOrchestrator:
    """
    Orchestrates data collection from all collectors.

    Handles the coordination of collecting applications, service principals,
    permission grants, and linking them together.
    """

    def __init__(self, client: GraphClient, config: Config):
        """
        Initialize the orchestrator.

        Args:
            client: Authenticated Graph client
            config: Configuration object
        """
        self.client = client
        self.config = config
        self.tenant_id = config.auth.tenant_id

        # Initialize collectors
        self.app_collector = ApplicationCollector(client, config)
        self.sp_collector = ServicePrincipalCollector(
            client, config, tenant_id=self.tenant_id
        )
        self.perm_collector = PermissionCollector(client, config)

    def collect_all(self) -> AnalysisResult:
        """
        Collect all data and create an AnalysisResult.

        This is the main entry point for data collection.

        Returns:
            AnalysisResult with all collected and linked data
        """
        logger.info("Starting data collection...")

        # Determine mode
        mode = self._determine_mode()
        logger.info("Running in %s mode", mode)

        # Collect base entities
        applications = self.app_collector.collect()
        service_principals = self.sp_collector.collect()

        # Build lookup maps
        app_by_app_id = {app.app_id: app for app in applications}
        sp_by_object_id = {sp.object_id: sp for sp in service_principals}
        sp_by_app_id = {sp.app_id: sp for sp in service_principals}

        # Update permission collector with resource SP names
        resource_sp_map = {sp.object_id: sp.display_name for sp in service_principals}
        self.perm_collector.resource_sp_map = resource_sp_map

        # Collect permission grants
        logger.info("Collecting permission grants...")
        all_grants = self.perm_collector.collect()

        # Group grants by client service principal
        grants_by_client: dict[str, list[Any]] = {}
        for grant in all_grants:
            if grant.client_id not in grants_by_client:
                grants_by_client[grant.client_id] = []
            grants_by_client[grant.client_id].append(grant)

        # Enrich service principals with grants, roles, and owners
        logger.info("Enriching service principals with permissions and metadata...")
        for sp in service_principals:
            # Add delegated permission grants
            sp.oauth2_permission_grants = grants_by_client.get(sp.object_id, [])

            # Track unique consenting users
            for grant in sp.oauth2_permission_grants:
                if grant.principal_id:
                    sp.unique_consenting_users.add(grant.principal_id)

            # Collect app role assignments (application permissions)
            sp.app_role_assignments = self.perm_collector.collect_app_role_assignments(
                sp.object_id
            )

            # Collect owners
            sp.owners = self.sp_collector.collect_owners(sp.object_id)

            # Link to application object if we have it
            if sp.app_id in app_by_app_id:
                sp.linked_application = app_by_app_id[sp.app_id]

            # Collect sign-in activity if in full mode
            if mode == "full":
                sp.sign_in_activity = self.sp_collector.collect_sign_in_activity(
                    sp.object_id
                )

        # Enrich applications with owners
        logger.info("Enriching applications with owners...")
        for app in applications:
            app.owners = self.app_collector.collect_owners(app.object_id)

        # Find credential expiry findings
        credential_findings = self._find_credential_findings(applications)

        # Build result
        result = AnalysisResult(
            tenant_id=self.tenant_id,
            analysis_timestamp=datetime.now(timezone.utc),
            mode=mode,
            applications=applications,
            service_principals=service_principals,
            credential_findings=credential_findings,
            total_apps=len(applications),
            total_service_principals=len(service_principals),
            apps_without_owners=sum(1 for app in applications if not app.has_owners),
            expiring_credentials_30_days=sum(
                1 for f in credential_findings
                if f.expires_in_days <= 30
            ),
            sign_in_data_available=self.client.sign_in_logs_available,
        )

        logger.info(
            "Collection complete: %d apps, %d service principals",
            result.total_apps,
            result.total_service_principals
        )

        return result

    def _determine_mode(self) -> str:
        """Determine the analysis mode based on config and capabilities."""
        if self.config.mode == "full":
            if not self.client.sign_in_logs_available:
                logger.warning(
                    "Full mode requested but sign-in logs not available. "
                    "Falling back to limited mode."
                )
                return "limited"
            return "full"
        elif self.config.mode == "limited":
            return "limited"
        else:  # auto
            return "full" if self.client.sign_in_logs_available else "limited"

    def _find_credential_findings(
        self,
        applications: list[Application]
    ) -> list[CredentialExpiryFinding]:
        """Find credentials that are expiring soon."""
        findings = []
        thresholds = self.config.thresholds

        for app in applications:
            for cred in app.all_credentials:
                days = cred.days_until_expiry
                if days is None or cred.is_expired:
                    continue

                if days > thresholds.credential_expiry_low:
                    continue

                # Determine severity
                if days <= thresholds.credential_expiry_critical:
                    severity = "Critical"
                elif days <= thresholds.credential_expiry_high:
                    severity = "High"
                elif days <= thresholds.credential_expiry_medium:
                    severity = "Medium"
                else:
                    severity = "Low"

                findings.append(CredentialExpiryFinding(
                    app_id=app.app_id,
                    app_name=app.display_name,
                    credential_type=cred.credential_type,
                    credential_name=cred.display_name,
                    expires_in_days=days,
                    expiry_date=cred.end_datetime,  # type: ignore
                    severity=severity,
                ))

        return sorted(findings, key=lambda f: f.expires_in_days)

    def collect_single_app(
        self,
        app_id_or_object_id: str
    ) -> tuple[Application | None, ServicePrincipal | None]:
        """
        Collect data for a single application by app ID or object ID.

        Returns:
            Tuple of (Application, ServicePrincipal) - either may be None
        """
        application = None
        service_principal = None

        # Try as object ID first for application
        application = self.app_collector.collect_one(app_id_or_object_id)

        # Try as app ID
        if not application:
            for app_data in self.client.get_all_pages(
                "applications",
                params={"$filter": f"appId eq '{app_id_or_object_id}'"}
            ):
                application = self.app_collector._parse_application(app_data)
                break

        # Find service principal
        if application:
            service_principal = self.sp_collector.collect_by_app_id(application.app_id)
        else:
            # Try directly as SP object ID
            service_principal = self.sp_collector.collect_one(app_id_or_object_id)

            # Try as app ID for SP
            if not service_principal:
                service_principal = self.sp_collector.collect_by_app_id(
                    app_id_or_object_id
                )

        # Enrich if we have a service principal
        if service_principal:
            service_principal.owners = self.sp_collector.collect_owners(
                service_principal.object_id
            )
            service_principal.oauth2_permission_grants = (
                self.perm_collector.collect_grants_for_client(
                    service_principal.object_id
                )
            )
            service_principal.app_role_assignments = (
                self.perm_collector.collect_app_role_assignments(
                    service_principal.object_id
                )
            )

            if self.client.sign_in_logs_available:
                service_principal.sign_in_activity = (
                    self.sp_collector.collect_sign_in_activity(
                        service_principal.object_id
                    )
                )

            service_principal.linked_application = application

        # Enrich application
        if application:
            application.owners = self.app_collector.collect_owners(
                application.object_id
            )

        return application, service_principal