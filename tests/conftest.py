"""Pytest configuration and fixtures."""

import pytest
from datetime import datetime, timezone, timedelta

from oauthkitchen.config import Config
from oauthkitchen.models import (
    Application,
    ServicePrincipal,
    OAuth2PermissionGrant,
    AppRoleAssignment,
    Credential,
    CredentialType,
    Owner,
    AppType,
    ConsentType,
    SignInActivity,
)


@pytest.fixture
def default_config() -> Config:
    """Create a default configuration for testing."""
    config = Config()
    config.auth.tenant_id = "test-tenant-id"
    config.auth.client_id = "test-client-id"
    return config


@pytest.fixture
def sample_application() -> Application:
    """Create a sample application for testing."""
    return Application(
        object_id="app-obj-123",
        app_id="app-id-123",
        display_name="Test Application",
        created_datetime=datetime(2023, 1, 1, tzinfo=timezone.utc),
        publisher_domain="example.com",
        verified_publisher=None,
        sign_in_audience="AzureADMyOrg",
        is_multi_tenant=False,
        password_credentials=[
            Credential(
                credential_id="cred-1",
                credential_type=CredentialType.PASSWORD,
                display_name="Secret 1",
                start_datetime=datetime(2023, 1, 1, tzinfo=timezone.utc),
                end_datetime=datetime.now(timezone.utc) + timedelta(days=30),
            )
        ],
        key_credentials=[],
        owners=[
            Owner(
                object_id="owner-1",
                display_name="Test Owner",
                user_principal_name="owner@example.com",
                object_type="user",
            )
        ],
    )


@pytest.fixture
def sample_service_principal() -> ServicePrincipal:
    """Create a sample service principal for testing."""
    sp = ServicePrincipal(
        object_id="sp-obj-123",
        app_id="app-id-123",
        display_name="Test App SP",
        created_datetime=datetime(2023, 1, 1, tzinfo=timezone.utc),
        service_principal_type="Application",
        app_type=AppType.TENANT_OWNED,
        publisher_name="Example Corp",
        verified_publisher=None,
        app_owner_organization_id="test-tenant-id",
        account_enabled=True,
    )

    # Add delegated permission grants
    sp.oauth2_permission_grants = [
        OAuth2PermissionGrant(
            id="grant-1",
            client_id="sp-obj-123",
            consent_type=ConsentType.ADMIN,
            principal_id=None,
            resource_id="graph-sp-id",
            scope="User.Read Mail.Read",
        )
    ]

    # Add app role assignments
    sp.app_role_assignments = [
        AppRoleAssignment(
            id="role-1",
            app_role_id="role-id-1",
            principal_id="sp-obj-123",
            principal_type="ServicePrincipal",
            resource_id="graph-sp-id",
            resource_display_name="Microsoft Graph",
            role_value="User.Read.All",
        )
    ]

    sp.owners = [
        Owner(
            object_id="owner-1",
            display_name="Test Owner",
            user_principal_name="owner@example.com",
            object_type="user",
        )
    ]

    return sp


@pytest.fixture
def high_risk_service_principal() -> ServicePrincipal:
    """Create a high-risk service principal for testing."""
    sp = ServicePrincipal(
        object_id="sp-high-risk",
        app_id="app-high-risk",
        display_name="Risky Third Party App",
        created_datetime=datetime(2023, 1, 1, tzinfo=timezone.utc),
        service_principal_type="Application",
        app_type=AppType.THIRD_PARTY_MULTI_TENANT,
        publisher_name=None,
        verified_publisher=None,
        app_owner_organization_id="other-tenant-id",
        account_enabled=True,
    )

    # Add high-impact delegated permissions via user consent
    sp.oauth2_permission_grants = [
        OAuth2PermissionGrant(
            id="grant-risky",
            client_id="sp-high-risk",
            consent_type=ConsentType.USER,
            principal_id="user-1",
            resource_id="graph-sp-id",
            scope="Mail.ReadWrite Files.ReadWrite.All offline_access",
        ),
        OAuth2PermissionGrant(
            id="grant-risky-2",
            client_id="sp-high-risk",
            consent_type=ConsentType.USER,
            principal_id="user-2",
            resource_id="graph-sp-id",
            scope="Mail.ReadWrite",
        )
    ]
    sp.unique_consenting_users = {"user-1", "user-2"}

    # No owners (orphaned)
    sp.owners = []

    return sp


@pytest.fixture
def microsoft_first_party_sp() -> ServicePrincipal:
    """Create a Microsoft first-party service principal."""
    return ServicePrincipal(
        object_id="ms-sp-123",
        app_id="00000003-0000-0000-c000-000000000000",  # MS Graph
        display_name="Microsoft Graph",
        created_datetime=datetime(2020, 1, 1, tzinfo=timezone.utc),
        service_principal_type="Application",
        app_type=AppType.FIRST_PARTY_MICROSOFT,
        publisher_name="Microsoft",
        verified_publisher={
            "verifiedPublisherId": "f8cdef31-a31e-4b4a-93e4-5f571e91255a"
        },
        app_owner_organization_id="72f988bf-86f1-41af-91ab-2d7cd011db47",
        account_enabled=True,
    )