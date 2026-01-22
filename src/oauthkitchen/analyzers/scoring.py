"""Risk scoring engine for OAuth applications."""

from __future__ import annotations

from oauthkitchen.analyzers.translator import PermissionTranslator
from oauthkitchen.config import Config, ScoringWeights
from oauthkitchen.models import (
    AnalysisResult,
    AppType,
    ConsentType,
    RiskCategory,
    RiskFactor,
    RiskScore,
    ServicePrincipal,
)
from oauthkitchen.utils.logging import get_logger

logger = get_logger("scoring")


class RiskScorer:
    """
    Calculates risk scores for OAuth applications.

    The scoring model is:
    1. Permission impact scores (from translator rules)
    2. Multipliers for permission type (app vs delegated)
    3. Multipliers for consent type, publisher trust, ownership
    4. Additional factors for inactivity, credential expiry, etc.

    All weights are configurable via config.
    """

    # Risk level thresholds
    CRITICAL_THRESHOLD = 80
    HIGH_THRESHOLD = 60
    MEDIUM_THRESHOLD = 40

    def __init__(
        self,
        config: Config,
        translator: PermissionTranslator | None = None
    ):
        """
        Initialize the scorer.

        Args:
            config: Configuration with scoring weights
            translator: Permission translator for impact scores
        """
        self.config = config
        self.weights = config.scoring
        self.thresholds = config.thresholds
        self.translator = translator or PermissionTranslator()

    def score_service_principal(
        self,
        sp: ServicePrincipal
    ) -> RiskScore:
        """
        Calculate risk score for a service principal.

        Args:
            sp: The service principal to score

        Returns:
            RiskScore with total score and factor breakdown
        """
        factors: list[RiskFactor] = []

        # Check if on allow list
        if sp.app_id in self.config.allow_deny.allowed_app_ids:
            return RiskScore(
                total_score=0,
                risk_level="Allowed",
                factors=[RiskFactor(
                    name="Allow List",
                    description="App is on the allow list",
                    score=0,
                    weight=1.0,
                )]
            )

        # Check if on deny list
        if sp.app_id in self.config.allow_deny.denied_app_ids:
            factors.append(RiskFactor(
                name="Deny List",
                description="App is on the deny list",
                score=100,
                weight=1.0,
                details=f"App ID: {sp.app_id}"
            ))

        # Score permissions
        permission_factors = self._score_permissions(sp)
        factors.extend(permission_factors)

        # Score trust factors
        trust_factors = self._score_trust_factors(sp)
        factors.extend(trust_factors)

        # Score ownership
        ownership_factors = self._score_ownership(sp)
        factors.extend(ownership_factors)

        # Score activity (if available)
        activity_factors = self._score_activity(sp)
        factors.extend(activity_factors)

        # Score credential hygiene (if linked to app)
        if sp.linked_application:
            cred_factors = self._score_credentials(sp)
            factors.extend(cred_factors)

        # Calculate total score
        total = self._calculate_total(factors)

        # Determine risk level
        if total >= self.CRITICAL_THRESHOLD:
            risk_level = "Critical"
        elif total >= self.HIGH_THRESHOLD:
            risk_level = "High"
        elif total >= self.MEDIUM_THRESHOLD:
            risk_level = "Medium"
        else:
            risk_level = "Low"

        return RiskScore(
            total_score=total,
            risk_level=risk_level,
            factors=factors
        )

    def score_all(
        self,
        result: AnalysisResult
    ) -> dict[str, RiskScore]:
        """
        Score all service principals in an analysis result.

        Updates the result.risk_scores dict and returns it.
        """
        logger.info("Scoring %d service principals...", len(result.service_principals))

        scores: dict[str, RiskScore] = {}
        critical_count = 0
        high_count = 0

        for sp in result.service_principals:
            score = self.score_service_principal(sp)
            scores[sp.object_id] = score

            if score.risk_level == "Critical":
                critical_count += 1
            elif score.risk_level == "High":
                high_count += 1

        result.risk_scores = scores
        result.critical_count = critical_count
        result.high_risk_count = high_count

        logger.info(
            "Scoring complete: %d critical, %d high risk",
            critical_count,
            high_count
        )

        return scores

    def _score_permissions(
        self,
        sp: ServicePrincipal
    ) -> list[RiskFactor]:
        """Score based on granted permissions."""
        factors: list[RiskFactor] = []

        # Score delegated permissions
        for scope in sp.all_delegated_scopes:
            translated = self.translator.translate(scope)
            base_score = translated.impact_score

            # Apply delegated multiplier
            score = int(base_score * self.weights.delegated_permission_multiplier)

            if score > 0:
                factors.append(RiskFactor(
                    name=f"Delegated: {scope}",
                    description=translated.plain_english,
                    score=score,
                    weight=1.0,
                    details=f"Category: {translated.category_label}"
                ))

        # Score application permissions
        for role_value in sp.all_app_role_values:
            if not role_value or role_value == "Default Access":
                continue

            translated = self.translator.translate(role_value)
            base_score = translated.impact_score

            # Apply application permission multiplier (higher risk)
            score = int(base_score * self.weights.application_permission_multiplier)

            if score > 0:
                factors.append(RiskFactor(
                    name=f"Application: {role_value}",
                    description=translated.plain_english,
                    score=score,
                    weight=1.0,
                    details=f"Category: {translated.category_label}"
                ))

        # Check for user consent
        has_user_consent = any(
            grant.consent_type == ConsentType.USER
            for grant in sp.oauth2_permission_grants
        )

        if has_user_consent:
            factors.append(RiskFactor(
                name="User Consent Present",
                description="Some permissions were granted via user consent (not admin)",
                score=20,
                weight=self.weights.user_consent_weight,
                details=f"Users who consented: {sp.consent_user_count}"
            ))

        return factors

    def _score_trust_factors(
        self,
        sp: ServicePrincipal
    ) -> list[RiskFactor]:
        """Score based on publisher and trust factors."""
        factors: list[RiskFactor] = []

        # First-party Microsoft apps get reduced risk
        if sp.app_type == AppType.FIRST_PARTY_MICROSOFT:
            factors.append(RiskFactor(
                name="Microsoft First-Party",
                description="This is a Microsoft first-party application",
                score=-30,  # Negative = reduces risk
                weight=self.weights.first_party_microsoft_weight,
            ))
            return factors  # Skip other trust checks for MS apps

        # No verified publisher
        if not sp.has_verified_publisher:
            factors.append(RiskFactor(
                name="No Verified Publisher",
                description="App does not have a verified publisher",
                score=15,
                weight=self.weights.no_verified_publisher_weight,
            ))

        # External/multi-tenant app
        if sp.app_type == AppType.THIRD_PARTY_MULTI_TENANT:
            factors.append(RiskFactor(
                name="Third-Party Multi-Tenant",
                description="App is owned by external organization",
                score=10,
                weight=self.weights.external_multi_tenant_weight,
                details=f"Owner org: {sp.app_owner_organization_id or 'Unknown'}"
            ))

        elif sp.app_type == AppType.EXTERNAL_UNKNOWN:
            factors.append(RiskFactor(
                name="Unknown Origin",
                description="App origin could not be determined",
                score=20,
                weight=self.weights.external_multi_tenant_weight,
            ))

        return factors

    def _score_ownership(
        self,
        sp: ServicePrincipal
    ) -> list[RiskFactor]:
        """Score based on ownership status."""
        factors: list[RiskFactor] = []

        if not sp.has_owners:
            # Get highest permission impact for context
            max_impact = 0
            for scope in sp.all_delegated_scopes:
                translated = self.translator.translate(scope)
                max_impact = max(max_impact, translated.impact_score)

            for role in sp.all_app_role_values:
                if role and role != "Default Access":
                    translated = self.translator.translate(role)
                    max_impact = max(max_impact, translated.impact_score)

            # More concerning if high-impact permissions
            score = 15 if max_impact >= 70 else 10

            factors.append(RiskFactor(
                name="No Owners",
                description="Service principal has no assigned owners",
                score=score,
                weight=self.weights.no_owner_weight,
                details="Orphaned apps are harder to manage and review"
            ))

        return factors

    def _score_activity(
        self,
        sp: ServicePrincipal
    ) -> list[RiskFactor]:
        """Score based on sign-in activity (if available)."""
        factors: list[RiskFactor] = []

        if not sp.sign_in_activity or not sp.sign_in_activity.data_available:
            return factors

        days_inactive = sp.sign_in_activity.days_since_last_activity
        threshold = self.thresholds.inactive_days_threshold

        if days_inactive is None:
            # Never used
            if sp.all_delegated_scopes or sp.all_app_role_values:
                factors.append(RiskFactor(
                    name="Never Used",
                    description="App has permissions but no sign-in activity recorded",
                    score=15,
                    weight=self.weights.unused_high_privilege_weight,
                    details="Consider reviewing if these permissions are still needed"
                ))
        elif days_inactive > threshold:
            # Check if high-impact permissions
            max_impact = 0
            for scope in sp.all_delegated_scopes:
                translated = self.translator.translate(scope)
                max_impact = max(max_impact, translated.impact_score)

            if max_impact >= 70:
                factors.append(RiskFactor(
                    name="Inactive High-Privilege",
                    description=f"App unused for {days_inactive} days with high-impact permissions",
                    score=25,
                    weight=self.weights.unused_high_privilege_weight,
                    details=f"Threshold: {threshold} days"
                ))

        return factors

    def _score_credentials(
        self,
        sp: ServicePrincipal
    ) -> list[RiskFactor]:
        """Score based on credential hygiene of linked application."""
        factors: list[RiskFactor] = []

        if not sp.linked_application:
            return factors

        app = sp.linked_application

        # Check for expiring credentials
        for cred, days in app.expiring_credentials:
            if days <= self.thresholds.credential_expiry_critical:
                factors.append(RiskFactor(
                    name=f"Credential Expiring ({cred.credential_type.value})",
                    description=f"Credential expires in {days} days",
                    score=10,
                    weight=1.2,
                    details=cred.display_name or "Unnamed credential"
                ))

        # Check for very old credentials
        for cred in app.all_credentials:
            age = cred.age_days
            if age and age > self.thresholds.credential_age_concern:
                factors.append(RiskFactor(
                    name="Old Credential",
                    description=f"Credential is {age} days old",
                    score=5,
                    weight=1.0,
                    details=f"Consider rotating: {cred.display_name or 'Unnamed'}"
                ))

        return factors

    def _calculate_total(
        self,
        factors: list[RiskFactor]
    ) -> int:
        """Calculate total weighted score from factors."""
        if not factors:
            return 0

        total = 0.0
        for factor in factors:
            contribution = factor.score * factor.weight
            total += contribution

        # Normalize to 0-100 range
        # Use diminishing returns for very high scores
        if total > 100:
            total = 100 + (total - 100) * 0.1
        if total > 120:
            total = 120

        # Ensure minimum of 0
        return max(0, min(100, int(total)))

    def get_score_explanation(
        self,
        score: RiskScore
    ) -> str:
        """Generate a human-readable explanation of a risk score."""
        lines = [
            f"Risk Level: {score.risk_level}",
            f"Total Score: {score.total_score}/100",
            "",
            "Score Breakdown:"
        ]

        # Sort factors by contribution
        sorted_factors = sorted(
            score.factors,
            key=lambda f: f.score * f.weight,
            reverse=True
        )

        for factor in sorted_factors:
            contribution = int(factor.score * factor.weight)
            sign = "+" if contribution >= 0 else ""
            lines.append(f"  {sign}{contribution}: {factor.name}")
            lines.append(f"         {factor.description}")
            if factor.details:
                lines.append(f"         → {factor.details}")

        return "\n".join(lines)