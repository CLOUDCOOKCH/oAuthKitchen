"""Tests for data models."""

import pytest
from datetime import datetime, timezone, timedelta

from oauthkitchen.models import (
    Application,
    ServicePrincipal,
    Credential,
    CredentialType,
    Owner,
    OAuth2PermissionGrant,
    AppRoleAssignment,
    ConsentType,
    AppType,
    RiskScore,
    RiskFactor,
)


class TestCredential:
    """Tests for Credential model."""

    def test_days_until_expiry_future(self):
        """Test days until expiry for future date."""
        now = datetime.now(timezone.utc)
        cred = Credential(
            credential_id="test",
            credential_type=CredentialType.PASSWORD,
            display_name="Test",
            start_datetime=now - timedelta(days=30),
            end_datetime=now + timedelta(days=45),
        )

        days = cred.days_until_expiry
        assert days is not None
        assert 44 <= days <= 46  # Allow for test timing

    def test_days_until_expiry_expired(self):
        """Test days until expiry for expired credential."""
        now = datetime.now(timezone.utc)
        cred = Credential(
            credential_id="test",
            credential_type=CredentialType.PASSWORD,
            display_name="Test",
            start_datetime=now - timedelta(days=100),
            end_datetime=now - timedelta(days=5),
        )

        days = cred.days_until_expiry
        assert days is not None
        assert days < 0
        assert cred.is_expired

    def test_days_until_expiry_none(self):
        """Test days until expiry when no end date."""
        cred = Credential(
            credential_id="test",
            credential_type=CredentialType.CERTIFICATE,
            display_name="Test",
            start_datetime=None,
            end_datetime=None,
        )

        assert cred.days_until_expiry is None
        assert not cred.is_expired

    def test_age_days(self):
        """Test credential age calculation."""
        now = datetime.now(timezone.utc)
        cred = Credential(
            credential_id="test",
            credential_type=CredentialType.PASSWORD,
            display_name="Test",
            start_datetime=now - timedelta(days=100),
            end_datetime=now + timedelta(days=265),
        )

        age = cred.age_days
        assert age is not None
        assert 99 <= age <= 101


class TestApplication:
    """Tests for Application model."""

    def test_has_verified_publisher_true(self):
        """Test has_verified_publisher when verified."""
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            verified_publisher={"verifiedPublisherId": "some-id"},
        )

        assert app.has_verified_publisher

    def test_has_verified_publisher_false(self):
        """Test has_verified_publisher when not verified."""
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            verified_publisher=None,
        )

        assert not app.has_verified_publisher

    def test_has_verified_publisher_empty(self):
        """Test has_verified_publisher with empty dict."""
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            verified_publisher={},
        )

        assert not app.has_verified_publisher

    def test_all_credentials(self):
        """Test all_credentials combines passwords and keys."""
        now = datetime.now(timezone.utc)
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            password_credentials=[
                Credential("p1", CredentialType.PASSWORD, "Pass1", now, now),
                Credential("p2", CredentialType.PASSWORD, "Pass2", now, now),
            ],
            key_credentials=[
                Credential("k1", CredentialType.CERTIFICATE, "Key1", now, now),
            ],
        )

        assert len(app.all_credentials) == 3

    def test_has_owners(self):
        """Test has_owners property."""
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
        )

        assert not app.has_owners

        app.owners = [Owner("o1", "Owner", "o@x.com", "user")]
        assert app.has_owners

    def test_expiring_credentials(self):
        """Test expiring_credentials property."""
        now = datetime.now(timezone.utc)
        app = Application(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            password_credentials=[
                Credential("p1", CredentialType.PASSWORD, "Soon", now, now + timedelta(days=15)),
                Credential("p2", CredentialType.PASSWORD, "Later", now, now + timedelta(days=120)),
                Credential("p3", CredentialType.PASSWORD, "Expired", now, now - timedelta(days=5)),
            ],
        )

        expiring = app.expiring_credentials
        assert len(expiring) == 1
        assert expiring[0][0].display_name == "Soon"
        assert 14 <= expiring[0][1] <= 16


class TestServicePrincipal:
    """Tests for ServicePrincipal model."""

    def test_all_delegated_scopes(self):
        """Test all_delegated_scopes aggregation."""
        sp = ServicePrincipal(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
        )

        sp.oauth2_permission_grants = [
            OAuth2PermissionGrant(
                id="g1",
                client_id="test",
                consent_type=ConsentType.ADMIN,
                principal_id=None,
                resource_id="r1",
                scope="User.Read Mail.Read",
            ),
            OAuth2PermissionGrant(
                id="g2",
                client_id="test",
                consent_type=ConsentType.USER,
                principal_id="u1",
                resource_id="r1",
                scope="Files.Read",
            ),
        ]

        scopes = sp.all_delegated_scopes
        assert scopes == {"User.Read", "Mail.Read", "Files.Read"}

    def test_all_app_role_values(self):
        """Test all_app_role_values aggregation."""
        sp = ServicePrincipal(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
        )

        sp.app_role_assignments = [
            AppRoleAssignment(
                id="r1",
                app_role_id="rid1",
                principal_id="test",
                principal_type="ServicePrincipal",
                resource_id="graph",
                resource_display_name="Graph",
                role_value="User.Read.All",
            ),
            AppRoleAssignment(
                id="r2",
                app_role_id="rid2",
                principal_id="test",
                principal_type="ServicePrincipal",
                resource_id="graph",
                resource_display_name="Graph",
                role_value="Mail.Read",
            ),
        ]

        roles = sp.all_app_role_values
        assert roles == {"User.Read.All", "Mail.Read"}

    def test_consent_user_count(self):
        """Test consent user count."""
        sp = ServicePrincipal(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
        )

        sp.unique_consenting_users = {"user1", "user2", "user3"}
        assert sp.consent_user_count == 3

    def test_is_tenant_owned(self):
        """Test is_tenant_owned property."""
        sp_owned = ServicePrincipal(
            object_id="test",
            app_id="test",
            display_name="Test",
            created_datetime=None,
            app_type=AppType.TENANT_OWNED,
        )

        sp_external = ServicePrincipal(
            object_id="test2",
            app_id="test2",
            display_name="Test2",
            created_datetime=None,
            app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        )

        assert sp_owned.is_tenant_owned
        assert not sp_external.is_tenant_owned


class TestOAuth2PermissionGrant:
    """Tests for OAuth2PermissionGrant model."""

    def test_scopes_property(self):
        """Test scopes splitting."""
        grant = OAuth2PermissionGrant(
            id="test",
            client_id="client",
            consent_type=ConsentType.ADMIN,
            principal_id=None,
            resource_id="resource",
            scope="User.Read Mail.Read Files.ReadWrite.All",
        )

        scopes = grant.scopes
        assert scopes == ["User.Read", "Mail.Read", "Files.ReadWrite.All"]

    def test_scopes_empty(self):
        """Test scopes with empty scope string."""
        grant = OAuth2PermissionGrant(
            id="test",
            client_id="client",
            consent_type=ConsentType.ADMIN,
            principal_id=None,
            resource_id="resource",
            scope="",
        )

        assert grant.scopes == []


class TestRiskScore:
    """Tests for RiskScore model."""

    def test_breakdown_text_with_factors(self):
        """Test breakdown text generation."""
        score = RiskScore(
            total_score=75,
            risk_level="High",
            factors=[
                RiskFactor(
                    name="High Permission",
                    description="Has Directory.ReadWrite.All",
                    score=50,
                    weight=1.5,
                    details="Tenant takeover potential",
                ),
                RiskFactor(
                    name="No Owner",
                    description="App has no owners",
                    score=10,
                    weight=1.3,
                ),
            ],
        )

        breakdown = score.breakdown_text
        assert "High Permission" in breakdown
        assert "No Owner" in breakdown

    def test_breakdown_text_empty(self):
        """Test breakdown text with no factors."""
        score = RiskScore(
            total_score=0,
            risk_level="Low",
            factors=[],
        )

        breakdown = score.breakdown_text
        assert "No risk factors" in breakdown