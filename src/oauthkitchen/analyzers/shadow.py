"""Shadow OAuth Detector - identifies risky OAuth exposure patterns."""

from __future__ import annotations

from oauthkitchen.analyzers.translator import PermissionTranslator
from oauthkitchen.config import Config
from oauthkitchen.models import (
    AnalysisResult,
    AppType,
    ConsentType,
    RiskCategory,
    ServicePrincipal,
    ShadowOAuthFinding,
)
from oauthkitchen.utils.logging import get_logger

logger = get_logger("shadow")

# High-impact scopes that warrant extra scrutiny
HIGH_IMPACT_SCOPES = {
    "Directory.ReadWrite.All",
    "RoleManagement.ReadWrite.Directory",
    "Application.ReadWrite.All",
    "AppRoleAssignment.ReadWrite.All",
    "Mail.ReadWrite",
    "Mail.Read",
    "Files.ReadWrite.All",
    "Files.Read.All",
    "Sites.ReadWrite.All",
    "User.ReadWrite.All",
    "Group.ReadWrite.All",
    "GroupMember.ReadWrite.All",
    "Chat.Read.All",
    "ChannelMessage.Read.All",
}


class ShadowOAuthDetector:
    """
    Detects shadow OAuth patterns that indicate potential security risks.

    Shadow OAuth patterns include:
    - External apps with delegated grants not owned by tenant
    - User-consented apps with high-impact scopes
    - Apps with offline_access (long-lived refresh tokens)
    - Inactive apps with elevated permissions
    - Apps without owners but with high privileges
    """

    def __init__(
        self,
        config: Config,
        translator: PermissionTranslator | None = None
    ):
        """
        Initialize the detector.

        Args:
            config: Configuration object
            translator: Permission translator for impact assessment
        """
        self.config = config
        self.thresholds = config.thresholds
        self.translator = translator or PermissionTranslator()

    def detect(
        self,
        result: AnalysisResult
    ) -> list[ShadowOAuthFinding]:
        """
        Run all shadow OAuth detection rules.

        Args:
            result: Analysis result with collected data

        Returns:
            List of findings
        """
        logger.info("Running shadow OAuth detection...")

        findings: list[ShadowOAuthFinding] = []

        for sp in result.service_principals:
            # Skip first-party Microsoft apps
            if sp.app_type == AppType.FIRST_PARTY_MICROSOFT:
                continue

            # Skip apps on allow list
            if sp.app_id in self.config.allow_deny.allowed_app_ids:
                continue

            # Run detection rules
            findings.extend(self._detect_external_delegated_grants(sp))
            findings.extend(self._detect_user_consent_high_impact(sp))
            findings.extend(self._detect_offline_access_risk(sp))
            findings.extend(self._detect_inactive_privileged(sp, result))
            findings.extend(self._detect_orphaned_privileged(sp))
            findings.extend(self._detect_unknown_publisher_high_impact(sp))

        # Sort by severity
        severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
        findings.sort(key=lambda f: severity_order.get(f.severity, 99))

        result.shadow_findings = findings

        logger.info("Found %d shadow OAuth findings", len(findings))
        return findings

    def _detect_external_delegated_grants(
        self,
        sp: ServicePrincipal
    ) -> list[ShadowOAuthFinding]:
        """Detect external apps with delegated permission grants."""
        findings: list[ShadowOAuthFinding] = []

        # Only flag external/multi-tenant apps
        if sp.app_type not in [AppType.THIRD_PARTY_MULTI_TENANT, AppType.EXTERNAL_UNKNOWN]:
            return findings

        if not sp.has_delegated_grants:
            return findings

        # Check for high-impact scopes
        high_impact = sp.all_delegated_scopes & HIGH_IMPACT_SCOPES
        all_scopes = list(sp.all_delegated_scopes)

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="external_delegated_high_impact",
                severity="High",
                title="External App with High-Impact Delegated Permissions",
                description=(
                    f"Third-party app '{sp.display_name}' has delegated permissions "
                    f"including high-impact scopes. This app is not owned by your tenant."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact),
                affected_user_count=sp.consent_user_count,
                recommendation=(
                    "Review if this app is still needed. Verify the publisher and "
                    "consider reducing permissions or removing the app."
                )
            ))
        elif all_scopes:
            findings.append(ShadowOAuthFinding(
                finding_type="external_delegated",
                severity="Medium",
                title="External App with Delegated Permissions",
                description=(
                    f"Third-party app '{sp.display_name}' has delegated permissions. "
                    f"This app is not owned by your tenant."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=all_scopes,
                affected_user_count=sp.consent_user_count,
                recommendation=(
                    "Verify this app is authorized for use in your organization."
                )
            ))

        return findings

    def _detect_user_consent_high_impact(
        self,
        sp: ServicePrincipal
    ) -> list[ShadowOAuthFinding]:
        """Detect user-consented apps with high-impact scopes."""
        findings: list[ShadowOAuthFinding] = []

        # Check for user consent
        user_consented_scopes: set[str] = set()
        for grant in sp.oauth2_permission_grants:
            if grant.consent_type == ConsentType.USER:
                user_consented_scopes.update(grant.scopes)

        if not user_consented_scopes:
            return findings

        # Check for high-impact scopes via user consent
        high_impact = user_consented_scopes & HIGH_IMPACT_SCOPES

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="user_consent_high_impact",
                severity="High",
                title="User-Consented App with High-Impact Permissions",
                description=(
                    f"App '{sp.display_name}' received high-impact permissions via user consent "
                    f"(not admin consent). {sp.consent_user_count} user(s) granted consent."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact),
                affected_user_count=sp.consent_user_count,
                recommendation=(
                    "Review user consent settings. Consider blocking user consent for "
                    "high-impact permissions and requiring admin approval."
                )
            ))

        return findings

    def _detect_offline_access_risk(
        self,
        sp: ServicePrincipal
    ) -> list[ShadowOAuthFinding]:
        """Detect apps with offline_access that increase token persistence risk."""
        findings: list[ShadowOAuthFinding] = []

        if "offline_access" not in sp.all_delegated_scopes:
            return findings

        # Check if combined with high-impact scopes
        other_scopes = sp.all_delegated_scopes - {"offline_access", "openid", "profile", "email"}
        high_impact = other_scopes & HIGH_IMPACT_SCOPES

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="offline_access_high_impact",
                severity="Medium",
                title="Long-Lived Token Risk with High-Impact Permissions",
                description=(
                    f"App '{sp.display_name}' has offline_access (refresh tokens) combined "
                    f"with high-impact permissions. This allows persistent access even after "
                    f"password changes."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact | {"offline_access"}),
                affected_user_count=sp.consent_user_count,
                recommendation=(
                    "Consider if offline_access is necessary. Review token lifetime policies "
                    "and implement Conditional Access for app access controls."
                )
            ))

        return findings

    def _detect_inactive_privileged(
        self,
        sp: ServicePrincipal,
        result: AnalysisResult
    ) -> list[ShadowOAuthFinding]:
        """Detect inactive apps with elevated permissions."""
        findings: list[ShadowOAuthFinding] = []

        # Skip if sign-in data not available
        if not result.sign_in_data_available:
            return findings

        if not sp.sign_in_activity or not sp.sign_in_activity.data_available:
            return findings

        days_inactive = sp.sign_in_activity.days_since_last_activity
        threshold = self.thresholds.inactive_days_threshold

        # Check if inactive
        if days_inactive is None:
            # Never used
            is_inactive = True
            inactive_msg = "never been used"
        elif days_inactive > threshold:
            is_inactive = True
            inactive_msg = f"not been used in {days_inactive} days"
        else:
            is_inactive = False

        if not is_inactive:
            return findings

        # Check for high-impact permissions
        all_perms = sp.all_delegated_scopes | sp.all_app_role_values
        high_impact = all_perms & HIGH_IMPACT_SCOPES

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="inactive_privileged",
                severity="High",
                title="Inactive App with High-Impact Permissions",
                description=(
                    f"App '{sp.display_name}' has {inactive_msg} but retains "
                    f"high-impact permissions."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact),
                recommendation=(
                    f"Review if this app is still needed. Consider removing or reducing "
                    f"permissions for unused apps (inactive threshold: {threshold} days)."
                )
            ))

        return findings

    def _detect_orphaned_privileged(
        self,
        sp: ServicePrincipal
    ) -> list[ShadowOAuthFinding]:
        """Detect apps without owners that have elevated permissions."""
        findings: list[ShadowOAuthFinding] = []

        if sp.has_owners:
            return findings

        # Check for high-impact permissions
        all_perms = sp.all_delegated_scopes | sp.all_app_role_values
        high_impact = all_perms & HIGH_IMPACT_SCOPES

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="orphaned_privileged",
                severity="High",
                title="Orphaned App with High-Impact Permissions",
                description=(
                    f"App '{sp.display_name}' has no assigned owners but has "
                    f"high-impact permissions."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact),
                recommendation=(
                    "Assign owners to this app to ensure accountability. "
                    "Consider if the permissions are still needed."
                )
            ))
        elif all_perms:
            findings.append(ShadowOAuthFinding(
                finding_type="orphaned_with_permissions",
                severity="Medium",
                title="Orphaned App with Permissions",
                description=(
                    f"App '{sp.display_name}' has no assigned owners but has "
                    f"active permissions."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(all_perms),
                recommendation="Assign owners to this app to ensure accountability."
            ))

        return findings

    def _detect_unknown_publisher_high_impact(
        self,
        sp: ServicePrincipal
    ) -> list[ShadowOAuthFinding]:
        """Detect apps without verified publisher that have high-impact permissions."""
        findings: list[ShadowOAuthFinding] = []

        if sp.has_verified_publisher:
            return findings

        # Skip tenant-owned apps (we control them)
        if sp.app_type == AppType.TENANT_OWNED:
            return findings

        # Check for high-impact permissions
        all_perms = sp.all_delegated_scopes | sp.all_app_role_values
        high_impact = all_perms & HIGH_IMPACT_SCOPES

        if high_impact:
            findings.append(ShadowOAuthFinding(
                finding_type="unverified_publisher_high_impact",
                severity="High",
                title="Unverified Publisher with High-Impact Permissions",
                description=(
                    f"App '{sp.display_name}' has no verified publisher but has "
                    f"high-impact permissions."
                ),
                service_principal_id=sp.object_id,
                service_principal_name=sp.display_name,
                affected_scopes=list(high_impact),
                recommendation=(
                    "Verify the legitimacy of this app. Consider requiring verified "
                    "publishers for apps with high-impact permissions."
                )
            ))

        return findings

    def get_safe_to_review_first(
        self,
        findings: list[ShadowOAuthFinding]
    ) -> list[ShadowOAuthFinding]:
        """
        Get findings that are safe to review first.

        These are typically lower risk to investigate and may be quick wins.
        """
        safe_types = {
            "orphaned_with_permissions",
            "inactive_privileged",
            "orphaned_privileged",
        }

        return [
            f for f in findings
            if f.finding_type in safe_types
        ]

    def get_blast_radius_report(
        self,
        findings: list[ShadowOAuthFinding],
        service_principals: list[ServicePrincipal]
    ) -> list[dict]:
        """
        Generate blast radius hints showing impact scope.

        Returns list of dicts with:
        - sp_id, sp_name
        - affected_users: count
        - resource_apis: list of affected APIs
        - risk_summary
        """
        sp_map = {sp.object_id: sp for sp in service_principals}
        results = []

        seen_sps: set[str] = set()

        for finding in findings:
            if finding.service_principal_id in seen_sps:
                continue
            seen_sps.add(finding.service_principal_id)

            sp = sp_map.get(finding.service_principal_id)
            if not sp:
                continue

            # Determine affected resource APIs
            resource_apis: set[str] = set()
            for grant in sp.oauth2_permission_grants:
                # Resource ID maps to a service principal
                if grant.resource_id in sp_map:
                    resource_apis.add(sp_map[grant.resource_id].display_name)
                else:
                    resource_apis.add(f"Resource: {grant.resource_id[:8]}...")

            for assignment in sp.app_role_assignments:
                if assignment.resource_display_name:
                    resource_apis.add(assignment.resource_display_name)
                elif assignment.resource_id in sp_map:
                    resource_apis.add(sp_map[assignment.resource_id].display_name)

            results.append({
                "sp_id": sp.object_id,
                "sp_name": sp.display_name,
                "app_id": sp.app_id,
                "affected_users": sp.consent_user_count,
                "resource_apis": sorted(resource_apis),
                "total_permissions": len(sp.all_delegated_scopes) + len(sp.all_app_role_values),
                "severity": finding.severity,
            })

        # Sort by affected users descending
        results.sort(key=lambda x: x["affected_users"], reverse=True)

        return results