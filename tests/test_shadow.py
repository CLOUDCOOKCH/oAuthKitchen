"""Tests for Shadow OAuth detector."""

import pytest
from datetime import datetime, timezone

from oauthkitchen.analyzers.shadow import ShadowOAuthDetector
from oauthkitchen.config import Config
from oauthkitchen.models import (
    AnalysisResult,
    ServicePrincipal,
    AppType,
    ConsentType,
    OAuth2PermissionGrant,
    SignInActivity,
)


class TestShadowOAuthDetector:
    """Tests for ShadowOAuthDetector."""

    @pytest.fixture
    def detector(self, default_config: Config) -> ShadowOAuthDetector:
        """Create a detector with default config."""
        return ShadowOAuthDetector(default_config)

    @pytest.fixture
    def analysis_result(self) -> AnalysisResult:
        """Create an empty analysis result."""
        return AnalysisResult(
            tenant_id="test-tenant",
            analysis_timestamp=datetime.now(timezone.utc),
            mode="full",
        )

    def test_detect_external_delegated_high_impact(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test detection of external apps with high-impact delegated permissions."""
        sp = ServicePrincipal(
            object_id="ext-sp",
            app_id="ext-app",
            display_name="External App",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="ext-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Mail.ReadWrite Files.ReadWrite.All",
            )
        ]

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert len(findings) > 0
        assert any(f.finding_type == "external_delegated_high_impact" for f in findings)

    def test_detect_user_consent_high_impact(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test detection of user-consented apps with high-impact permissions."""
        sp = ServicePrincipal(
            object_id="user-consent-sp",
            app_id="user-consent-app",
            display_name="User Consent App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="user-consent-sp",
                consent_type=ConsentType.USER,
                principal_id="user-1",
                resource_id="graph",
                scope="Mail.ReadWrite Directory.ReadWrite.All",
            )
        ]
        sp.unique_consenting_users = {"user-1"}
        sp.owners = []

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert any(f.finding_type == "user_consent_high_impact" for f in findings)

    def test_detect_offline_access_risk(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test detection of offline_access with high-impact permissions."""
        sp = ServicePrincipal(
            object_id="offline-sp",
            app_id="offline-app",
            display_name="Offline Access App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="offline-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="offline_access Mail.ReadWrite",
            )
        ]
        sp.owners = []

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert any(f.finding_type == "offline_access_high_impact" for f in findings)

    def test_detect_orphaned_privileged(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test detection of orphaned apps with high privileges."""
        sp = ServicePrincipal(
            object_id="orphan-sp",
            app_id="orphan-app",
            display_name="Orphan App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="orphan-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Directory.ReadWrite.All",
            )
        ]
        sp.owners = []  # No owners

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert any(f.finding_type == "orphaned_privileged" for f in findings)

    def test_detect_unverified_publisher_high_impact(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test detection of unverified publisher with high-impact permissions."""
        sp = ServicePrincipal(
            object_id="unverified-sp",
            app_id="unverified-app",
            display_name="Unverified App",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
            verified_publisher=None,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="unverified-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Mail.Read",
            )
        ]
        sp.owners = []

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert any(f.finding_type == "unverified_publisher_high_impact" for f in findings)

    def test_skip_microsoft_first_party(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
        microsoft_first_party_sp: ServicePrincipal,
    ):
        """Test that Microsoft first-party apps are skipped."""
        # Add high-impact permissions to MS app
        microsoft_first_party_sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id=microsoft_first_party_sp.object_id,
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Directory.ReadWrite.All",
            )
        ]

        analysis_result.service_principals = [microsoft_first_party_sp]
        findings = detector.detect(analysis_result)

        # Should not flag Microsoft first-party apps
        assert len(findings) == 0

    def test_skip_allowed_apps(
        self,
        default_config: Config,
        analysis_result: AnalysisResult,
    ):
        """Test that apps on allow list are skipped."""
        default_config.allow_deny.allowed_app_ids = ["allowed-app"]
        detector = ShadowOAuthDetector(default_config)

        sp = ServicePrincipal(
            object_id="allowed-sp",
            app_id="allowed-app",
            display_name="Allowed App",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="allowed-sp",
                consent_type=ConsentType.USER,
                principal_id="user-1",
                resource_id="graph",
                scope="Directory.ReadWrite.All",
            )
        ]

        analysis_result.service_principals = [sp]
        findings = detector.detect(analysis_result)

        assert len(findings) == 0

    def test_findings_sorted_by_severity(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test that findings are sorted by severity."""
        # Create apps that will generate different severities
        sp_high = ServicePrincipal(
            object_id="high-sp",
            app_id="high-app",
            display_name="High Risk",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        )
        sp_high.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="high-sp",
                consent_type=ConsentType.USER,
                principal_id="user-1",
                resource_id="graph",
                scope="Directory.ReadWrite.All",
            )
        ]
        sp_high.unique_consenting_users = {"user-1"}
        sp_high.owners = []

        sp_medium = ServicePrincipal(
            object_id="medium-sp",
            app_id="medium-app",
            display_name="Medium Risk",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_medium.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="medium-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="offline_access Mail.ReadWrite",
            )
        ]
        sp_medium.owners = []

        analysis_result.service_principals = [sp_medium, sp_high]  # Add in wrong order
        findings = detector.detect(analysis_result)

        if len(findings) >= 2:
            # Critical/High should come before Medium/Low
            severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
            for i in range(len(findings) - 1):
                assert severity_order[findings[i].severity] <= severity_order[findings[i + 1].severity]

    def test_get_safe_to_review_first(
        self,
        detector: ShadowOAuthDetector,
        analysis_result: AnalysisResult,
    ):
        """Test getting safe-to-review findings."""
        sp = ServicePrincipal(
            object_id="orphan-sp",
            app_id="orphan-app",
            display_name="Orphan App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="orphan-sp",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Directory.ReadWrite.All",
            )
        ]
        sp.owners = []

        analysis_result.service_principals = [sp]
        all_findings = detector.detect(analysis_result)
        safe_findings = detector.get_safe_to_review_first(all_findings)

        # Orphaned apps are typically safe to review first
        assert len(safe_findings) <= len(all_findings)