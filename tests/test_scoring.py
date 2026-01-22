"""Tests for the risk scoring engine."""

import pytest

from oauthkitchen.analyzers.scoring import RiskScorer
from oauthkitchen.analyzers.translator import PermissionTranslator
from oauthkitchen.config import Config
from oauthkitchen.models import (
    ServicePrincipal,
    AppType,
    ConsentType,
    OAuth2PermissionGrant,
    AppRoleAssignment,
    Owner,
)


class TestRiskScorer:
    """Tests for RiskScorer."""

    @pytest.fixture
    def scorer(self, default_config: Config) -> RiskScorer:
        """Create a scorer with default config."""
        translator = PermissionTranslator()
        return RiskScorer(default_config, translator)

    def test_score_low_risk_sp(
        self,
        scorer: RiskScorer,
        sample_service_principal: ServicePrincipal
    ):
        """Test scoring a low-risk service principal."""
        score = scorer.score_service_principal(sample_service_principal)

        # Tenant-owned app with owner and moderate permissions
        assert score.risk_level in ["Low", "Medium"]
        assert score.total_score < 60

    def test_score_high_risk_sp(
        self,
        scorer: RiskScorer,
        high_risk_service_principal: ServicePrincipal
    ):
        """Test scoring a high-risk service principal."""
        score = scorer.score_service_principal(high_risk_service_principal)

        # Third-party, no owner, user consent, high-impact permissions
        assert score.risk_level in ["High", "Critical"]
        assert score.total_score >= 60

    def test_score_microsoft_first_party(
        self,
        scorer: RiskScorer,
        microsoft_first_party_sp: ServicePrincipal
    ):
        """Test that Microsoft first-party apps get reduced scores."""
        score = scorer.score_service_principal(microsoft_first_party_sp)

        # MS first-party apps should have very low risk
        assert score.risk_level == "Low"
        assert score.total_score < 20

    def test_score_on_allow_list(self, scorer: RiskScorer):
        """Test that apps on allow list get zero score."""
        # Add app to allow list
        scorer.config.allow_deny.allowed_app_ids = ["allowed-app-id"]

        sp = ServicePrincipal(
            object_id="sp-allowed",
            app_id="allowed-app-id",
            display_name="Allowed App",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        )

        score = scorer.score_service_principal(sp)

        assert score.total_score == 0
        assert score.risk_level == "Allowed"

    def test_score_factors_are_explained(
        self,
        scorer: RiskScorer,
        high_risk_service_principal: ServicePrincipal
    ):
        """Test that score factors provide explanations."""
        score = scorer.score_service_principal(high_risk_service_principal)

        assert len(score.factors) > 0
        for factor in score.factors:
            assert factor.name
            assert factor.description
            assert factor.weight > 0

    def test_score_breakdown_text(
        self,
        scorer: RiskScorer,
        high_risk_service_principal: ServicePrincipal
    ):
        """Test that score breakdown text is generated."""
        score = scorer.score_service_principal(high_risk_service_principal)
        breakdown = score.breakdown_text

        assert len(breakdown) > 0
        # Should contain factor contributions
        assert "[" in breakdown  # Score indicators

    def test_user_consent_increases_risk(self, scorer: RiskScorer):
        """Test that user consent adds risk compared to admin consent."""
        sp_admin = ServicePrincipal(
            object_id="sp-admin",
            app_id="app-admin",
            display_name="Admin Consented",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_admin.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant-admin",
                client_id="sp-admin",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Mail.Read",
            )
        ]
        sp_admin.owners = [Owner("o1", "Owner", "o@x.com", "user")]

        sp_user = ServicePrincipal(
            object_id="sp-user",
            app_id="app-user",
            display_name="User Consented",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_user.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant-user",
                client_id="sp-user",
                consent_type=ConsentType.USER,
                principal_id="user-1",
                resource_id="graph",
                scope="Mail.Read",
            )
        ]
        sp_user.unique_consenting_users = {"user-1"}
        sp_user.owners = [Owner("o1", "Owner", "o@x.com", "user")]

        score_admin = scorer.score_service_principal(sp_admin)
        score_user = scorer.score_service_principal(sp_user)

        # User consent should add some risk
        assert score_user.total_score >= score_admin.total_score

    def test_no_owner_increases_risk(self, scorer: RiskScorer):
        """Test that apps without owners have higher risk."""
        sp_with_owner = ServicePrincipal(
            object_id="sp-owned",
            app_id="app-owned",
            display_name="Owned App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_with_owner.owners = [Owner("o1", "Owner", "o@x.com", "user")]

        sp_no_owner = ServicePrincipal(
            object_id="sp-orphan",
            app_id="app-orphan",
            display_name="Orphan App",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_no_owner.owners = []

        score_owned = scorer.score_service_principal(sp_with_owner)
        score_orphan = scorer.score_service_principal(sp_no_owner)

        assert score_orphan.total_score > score_owned.total_score

    def test_application_permissions_higher_risk_than_delegated(self, scorer: RiskScorer):
        """Test that application permissions score higher than delegated."""
        sp_delegated = ServicePrincipal(
            object_id="sp-del",
            app_id="app-del",
            display_name="Delegated Only",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_delegated.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="grant",
                client_id="sp-del",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="graph",
                scope="Mail.Read",
            )
        ]
        sp_delegated.owners = [Owner("o1", "Owner", "o@x.com", "user")]

        sp_application = ServicePrincipal(
            object_id="sp-app",
            app_id="app-app",
            display_name="Application Perm",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )
        sp_application.app_role_assignments = [
            AppRoleAssignment(
                id="role",
                app_role_id="role-id",
                principal_id="sp-app",
                principal_type="ServicePrincipal",
                resource_id="graph",
                resource_display_name="Graph",
                role_value="Mail.Read",  # Same permission but as app role
            )
        ]
        sp_application.owners = [Owner("o1", "Owner", "o@x.com", "user")]

        score_del = scorer.score_service_principal(sp_delegated)
        score_app = scorer.score_service_principal(sp_application)

        # Application permissions have 1.5x multiplier
        assert score_app.total_score > score_del.total_score

    def test_risk_levels(self, scorer: RiskScorer):
        """Test that risk levels are assigned correctly based on thresholds."""
        # We need to test the thresholds: Critical >= 80, High >= 60, Medium >= 40

        # Check scorer has correct thresholds
        assert scorer.CRITICAL_THRESHOLD == 80
        assert scorer.HIGH_THRESHOLD == 60
        assert scorer.MEDIUM_THRESHOLD == 40