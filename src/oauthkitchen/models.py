"""
Core data models for OAuthKitchen.

These models represent the normalized entities collected from Microsoft Graph
and the computed analysis results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class CredentialType(Enum):
    """Type of credential attached to an application."""
    PASSWORD = "password"
    CERTIFICATE = "certificate"


class ConsentType(Enum):
    """How consent was granted for a permission."""
    ADMIN = "admin"
    USER = "user"
    UNKNOWN = "unknown"


class PermissionType(Enum):
    """Type of permission grant."""
    DELEGATED = "delegated"
    APPLICATION = "application"


class RiskCategory(Enum):
    """Risk category for permission classification."""
    READ_ONLY = "read_only"
    DATA_EXFILTRATION = "data_exfiltration"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    TENANT_TAKEOVER = "tenant_takeover"
    PERSISTENCE = "persistence"
    LATERAL_MOVEMENT = "lateral_movement"
    UNKNOWN = "unknown"


class AppType(Enum):
    """Classification of application type."""
    FIRST_PARTY_MICROSOFT = "first_party_microsoft"
    TENANT_OWNED = "tenant_owned"
    THIRD_PARTY_MULTI_TENANT = "third_party_multi_tenant"
    EXTERNAL_UNKNOWN = "external_unknown"


@dataclass
class Credential:
    """Represents a password or certificate credential."""
    credential_id: str
    credential_type: CredentialType
    display_name: str | None
    start_datetime: datetime | None
    end_datetime: datetime | None
    key_id: str | None = None

    @property
    def days_until_expiry(self) -> int | None:
        """Calculate days until credential expires."""
        if not self.end_datetime:
            return None
        delta = self.end_datetime - datetime.now(self.end_datetime.tzinfo)
        return delta.days

    @property
    def is_expired(self) -> bool:
        """Check if credential is already expired."""
        days = self.days_until_expiry
        return days is not None and days < 0

    @property
    def age_days(self) -> int | None:
        """Calculate age in days since credential was created."""
        if not self.start_datetime:
            return None
        delta = datetime.now(self.start_datetime.tzinfo) - self.start_datetime
        return delta.days


@dataclass
class Owner:
    """Represents an owner of an application or service principal."""
    object_id: str
    display_name: str | None
    user_principal_name: str | None
    object_type: str  # user, servicePrincipal, etc.
    is_active: bool | None = None  # None if we can't determine


@dataclass
class PermissionDefinition:
    """Definition of a permission scope or app role."""
    id: str
    value: str  # The scope string like "Mail.Read"
    display_name: str | None
    description: str | None
    permission_type: PermissionType
    resource_app_id: str  # The app ID this permission belongs to (e.g., Graph)
    resource_display_name: str | None = None

    # Enriched data from translator
    plain_english: str | None = None
    risk_category: RiskCategory = RiskCategory.UNKNOWN
    abuse_scenarios: list[str] = field(default_factory=list)
    admin_impact_note: str | None = None
    impact_score: int = 0  # 0-100


@dataclass
class OAuth2PermissionGrant:
    """Represents a delegated permission grant (oauth2PermissionGrants)."""
    id: str
    client_id: str  # Service principal object ID that has the grant
    consent_type: ConsentType  # AllPrincipals (admin) or Principal (user)
    principal_id: str | None  # User who consented (if user consent)
    resource_id: str  # Service principal object ID of the resource (e.g., Graph SP)
    scope: str  # Space-separated scopes
    start_time: datetime | None = None
    expiry_time: datetime | None = None

    @property
    def scopes(self) -> list[str]:
        """Split scope string into individual scopes."""
        return [s.strip() for s in self.scope.split() if s.strip()]


@dataclass
class AppRoleAssignment:
    """Represents an application permission assignment (appRoleAssignments)."""
    id: str
    app_role_id: str  # The app role ID
    principal_id: str  # The service principal that has the assignment
    principal_type: str  # Usually "ServicePrincipal"
    resource_id: str  # The resource service principal
    resource_display_name: str | None
    created_datetime: datetime | None = None

    # Resolved role information
    role_value: str | None = None  # e.g., "Mail.Read"
    role_display_name: str | None = None


@dataclass
class SignInActivity:
    """Sign-in activity data for a service principal (if available)."""
    last_sign_in_datetime: datetime | None
    last_non_interactive_sign_in_datetime: datetime | None
    last_successful_sign_in_datetime: datetime | None
    data_available: bool = True  # False if we couldn't fetch this data

    @property
    def days_since_last_activity(self) -> int | None:
        """Days since any sign-in activity."""
        latest = None
        for dt in [
            self.last_sign_in_datetime,
            self.last_non_interactive_sign_in_datetime,
            self.last_successful_sign_in_datetime,
        ]:
            if dt and (latest is None or dt > latest):
                latest = dt

        if not latest:
            return None
        delta = datetime.now(latest.tzinfo) - latest
        return delta.days


@dataclass
class Application:
    """
    Represents an app registration in Entra ID.

    This is the application object that defines what the app can do.
    """
    object_id: str
    app_id: str  # Client ID
    display_name: str
    created_datetime: datetime | None

    # Publisher info
    publisher_domain: str | None = None
    verified_publisher: dict[str, Any] | None = None  # Raw verified publisher data

    # App configuration
    sign_in_audience: str | None = None  # AzureADMyOrg, AzureADMultipleOrgs, etc.
    is_multi_tenant: bool = False

    # Credentials
    password_credentials: list[Credential] = field(default_factory=list)
    key_credentials: list[Credential] = field(default_factory=list)

    # Owners
    owners: list[Owner] = field(default_factory=list)

    # Defined permissions (what the app requests)
    required_resource_access: list[dict[str, Any]] = field(default_factory=list)

    # Notes and tags
    notes: str | None = None
    tags: list[str] = field(default_factory=list)

    @property
    def has_verified_publisher(self) -> bool:
        """Check if app has a verified publisher."""
        return bool(
            self.verified_publisher
            and self.verified_publisher.get("verifiedPublisherId")
        )

    @property
    def all_credentials(self) -> list[Credential]:
        """Get all credentials (passwords and certificates)."""
        return self.password_credentials + self.key_credentials

    @property
    def has_owners(self) -> bool:
        """Check if app has any owners defined."""
        return len(self.owners) > 0

    @property
    def expiring_credentials(self) -> list[tuple[Credential, int]]:
        """Get credentials expiring within 90 days with days remaining."""
        result = []
        for cred in self.all_credentials:
            days = cred.days_until_expiry
            if days is not None and 0 <= days <= 90:
                result.append((cred, days))
        return sorted(result, key=lambda x: x[1])


@dataclass
class ServicePrincipal:
    """
    Represents an enterprise application (service principal) in Entra ID.

    This is the instance of an app in a specific tenant that has actual permissions.
    """
    object_id: str
    app_id: str  # Links to Application.app_id
    display_name: str
    created_datetime: datetime | None

    # Type classification
    service_principal_type: str | None = None  # Application, ManagedIdentity, Legacy, etc.
    app_type: AppType = AppType.EXTERNAL_UNKNOWN

    # Publisher info
    publisher_name: str | None = None
    verified_publisher: dict[str, Any] | None = None
    app_owner_organization_id: str | None = None  # Tenant ID that owns the app

    # Account settings
    account_enabled: bool = True

    # Tags (includes things like WindowsAzureActiveDirectoryIntegratedApp)
    tags: list[str] = field(default_factory=list)

    # Owners
    owners: list[Owner] = field(default_factory=list)

    # Granted permissions (computed from grants and assignments)
    oauth2_permission_grants: list[OAuth2PermissionGrant] = field(default_factory=list)
    app_role_assignments: list[AppRoleAssignment] = field(default_factory=list)

    # Sign-in activity (if available)
    sign_in_activity: SignInActivity | None = None

    # Linked application object (if we have it)
    linked_application: Application | None = None

    # Computed fields for analysis
    unique_consenting_users: set[str] = field(default_factory=set)

    @property
    def has_verified_publisher(self) -> bool:
        """Check if service principal has a verified publisher."""
        return bool(
            self.verified_publisher
            and self.verified_publisher.get("verifiedPublisherId")
        )

    @property
    def is_tenant_owned(self) -> bool:
        """Check if this SP is owned by the current tenant."""
        return self.app_type == AppType.TENANT_OWNED

    @property
    def has_owners(self) -> bool:
        """Check if SP has any owners defined."""
        return len(self.owners) > 0

    @property
    def has_delegated_grants(self) -> bool:
        """Check if SP has any delegated permission grants."""
        return len(self.oauth2_permission_grants) > 0

    @property
    def has_application_permissions(self) -> bool:
        """Check if SP has any application permission assignments."""
        return len(self.app_role_assignments) > 0

    @property
    def all_delegated_scopes(self) -> set[str]:
        """Get all unique delegated scopes granted to this SP."""
        scopes = set()
        for grant in self.oauth2_permission_grants:
            scopes.update(grant.scopes)
        return scopes

    @property
    def all_app_role_values(self) -> set[str]:
        """Get all unique app role values assigned to this SP."""
        return {
            a.role_value for a in self.app_role_assignments
            if a.role_value
        }

    @property
    def consent_user_count(self) -> int:
        """Count of unique users who granted consent."""
        return len(self.unique_consenting_users)


@dataclass
class RiskFactor:
    """Individual risk factor contributing to overall score."""
    name: str
    description: str
    score: int
    weight: float
    details: str | None = None


@dataclass
class RiskScore:
    """Computed risk score for an application/service principal."""
    total_score: int  # 0-100
    risk_level: str  # Critical, High, Medium, Low
    factors: list[RiskFactor] = field(default_factory=list)

    @property
    def breakdown_text(self) -> str:
        """Human-readable breakdown of risk factors."""
        if not self.factors:
            return "No risk factors identified"

        lines = []
        for f in sorted(self.factors, key=lambda x: x.score * x.weight, reverse=True):
            contribution = int(f.score * f.weight)
            lines.append(f"  [{contribution:+3d}] {f.name}: {f.description}")
            if f.details:
                lines.append(f"        → {f.details}")
        return "\n".join(lines)


@dataclass
class ShadowOAuthFinding:
    """A finding from the shadow OAuth detector."""
    finding_type: str
    severity: str  # Critical, High, Medium, Low
    title: str
    description: str
    service_principal_id: str
    service_principal_name: str
    affected_scopes: list[str] = field(default_factory=list)
    affected_user_count: int = 0
    recommendation: str | None = None


@dataclass
class CredentialExpiryFinding:
    """A credential expiry finding."""
    app_id: str
    app_name: str
    credential_type: CredentialType
    credential_name: str | None
    expires_in_days: int
    expiry_date: datetime
    severity: str  # Critical (<7 days), High (<30), Medium (<60), Low (<90)


@dataclass
class AnalysisResult:
    """Complete analysis result for export."""
    tenant_id: str
    analysis_timestamp: datetime
    mode: str  # "full" or "limited"

    # Collected entities
    applications: list[Application] = field(default_factory=list)
    service_principals: list[ServicePrincipal] = field(default_factory=list)

    # Computed results
    risk_scores: dict[str, RiskScore] = field(default_factory=dict)  # SP object_id -> score
    shadow_findings: list[ShadowOAuthFinding] = field(default_factory=list)
    credential_findings: list[CredentialExpiryFinding] = field(default_factory=list)

    # Statistics
    total_apps: int = 0
    total_service_principals: int = 0
    high_risk_count: int = 0
    critical_count: int = 0
    apps_without_owners: int = 0
    expiring_credentials_30_days: int = 0

    # Data availability flags
    sign_in_data_available: bool = False
    audit_log_available: bool = False

    @property
    def top_risky_apps(self) -> list[tuple[ServicePrincipal, RiskScore]]:
        """Get top 10 riskiest service principals."""
        scored = []
        for sp in self.service_principals:
            if sp.object_id in self.risk_scores:
                scored.append((sp, self.risk_scores[sp.object_id]))

        return sorted(scored, key=lambda x: x[1].total_score, reverse=True)[:10]
