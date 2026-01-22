"""Permission Translator - converts raw permissions to plain English with risk context."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from oauthkitchen.models import PermissionDefinition, PermissionType, RiskCategory
from oauthkitchen.utils.logging import get_logger

logger = get_logger("translator")

# Default rules file path
DEFAULT_RULES_PATH = Path(__file__).parent.parent / "rules" / "permissions.yaml"


@dataclass
class TranslatedPermission:
    """Result of translating a permission."""
    permission: str
    resource: str
    plain_english: str
    category: RiskCategory
    category_label: str
    impact_score: int
    abuse_scenarios: list[str]
    admin_impact_note: str | None
    is_known: bool


class PermissionTranslator:
    """
    Translates OAuth permission names into plain English with risk context.

    Uses a community-editable rules file (YAML) that maps permission names
    to descriptions, categories, and abuse scenarios.
    """

    # Category display labels
    CATEGORY_LABELS = {
        RiskCategory.READ_ONLY: "Read-only",
        RiskCategory.DATA_EXFILTRATION: "Data exfiltration",
        RiskCategory.PRIVILEGE_ESCALATION: "Privilege escalation",
        RiskCategory.TENANT_TAKEOVER: "Tenant takeover potential",
        RiskCategory.PERSISTENCE: "Persistence",
        RiskCategory.LATERAL_MOVEMENT: "Lateral movement",
        RiskCategory.UNKNOWN: "Unknown",
    }

    def __init__(self, rules_path: Path | str | None = None):
        """
        Initialize the translator.

        Args:
            rules_path: Path to the rules YAML file. Uses default if not specified.
        """
        self.rules_path = Path(rules_path) if rules_path else DEFAULT_RULES_PATH
        self.rules: dict[str, dict[str, Any]] = {}
        self._load_rules()

    def _load_rules(self) -> None:
        """Load rules from the YAML file."""
        if not self.rules_path.exists():
            logger.warning(
                "Rules file not found at %s, using empty rules",
                self.rules_path
            )
            return

        try:
            with open(self.rules_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}

            # Flatten the resource-grouped structure
            for resource, permissions in data.items():
                if isinstance(permissions, dict):
                    for perm_name, perm_data in permissions.items():
                        # Store with resource prefix for lookup
                        key = perm_name.lower()
                        self.rules[key] = {
                            "resource": resource,
                            **perm_data
                        }

            logger.info("Loaded %d permission rules", len(self.rules))

        except (yaml.YAMLError, OSError) as e:
            logger.error("Failed to load rules file: %s", e)

    def translate(
        self,
        permission: str,
        resource: str = "microsoft_graph"
    ) -> TranslatedPermission:
        """
        Translate a single permission.

        Args:
            permission: The permission name (e.g., "Mail.Read")
            resource: The resource API (e.g., "microsoft_graph")

        Returns:
            TranslatedPermission with all context
        """
        # Normalize permission name for lookup
        key = permission.lower()

        rule = self.rules.get(key)

        if rule:
            category = self._parse_category(rule.get("category", "unknown"))
            return TranslatedPermission(
                permission=permission,
                resource=rule.get("resource", resource),
                plain_english=rule.get(
                    "plain_english",
                    rule.get("display_name", permission)
                ),
                category=category,
                category_label=self.CATEGORY_LABELS.get(category, "Unknown"),
                impact_score=rule.get("impact_score", 30),
                abuse_scenarios=rule.get("abuse_scenarios", []),
                admin_impact_note=rule.get("admin_impact_note"),
                is_known=True,
            )

        # Unknown permission - return with sensible defaults
        return TranslatedPermission(
            permission=permission,
            resource=resource,
            plain_english=f"Permission: {permission} (no translation available)",
            category=RiskCategory.UNKNOWN,
            category_label="Unknown - requires review",
            impact_score=30,  # Moderate default
            abuse_scenarios=[],
            admin_impact_note=None,
            is_known=False,
        )

    def translate_many(
        self,
        permissions: list[str],
        resource: str = "microsoft_graph"
    ) -> list[TranslatedPermission]:
        """Translate multiple permissions."""
        return [self.translate(p, resource) for p in permissions]

    def enrich_permission_definition(
        self,
        permission: PermissionDefinition
    ) -> PermissionDefinition:
        """
        Enrich a PermissionDefinition with translation data.

        Modifies the permission in place and returns it.
        """
        translated = self.translate(permission.value)

        permission.plain_english = translated.plain_english
        permission.risk_category = translated.category
        permission.abuse_scenarios = translated.abuse_scenarios
        permission.admin_impact_note = translated.admin_impact_note
        permission.impact_score = translated.impact_score

        return permission

    def get_high_impact_permissions(
        self,
        min_score: int = 70
    ) -> list[tuple[str, TranslatedPermission]]:
        """
        Get all known high-impact permissions.

        Args:
            min_score: Minimum impact score to include

        Returns:
            List of (permission_name, TranslatedPermission) tuples
        """
        results = []
        for perm_key, rule in self.rules.items():
            if rule.get("impact_score", 0) >= min_score:
                # Reconstruct the original case from display_name or use key
                perm_name = rule.get("display_name", perm_key)
                # Find original casing
                for orig_key in self.rules:
                    if orig_key.lower() == perm_key:
                        perm_name = orig_key
                        break

                translated = self.translate(perm_name)
                results.append((perm_name, translated))

        return sorted(results, key=lambda x: x[1].impact_score, reverse=True)

    def format_permission_report(
        self,
        permission: str,
        include_scenarios: bool = True
    ) -> str:
        """
        Format a permission into a human-readable report string.

        Args:
            permission: Permission to translate
            include_scenarios: Whether to include abuse scenarios
        """
        translated = self.translate(permission)

        lines = [
            f"Permission: {translated.permission}",
            f"Resource: {translated.resource}",
            f"Description: {translated.plain_english}",
            f"Risk Category: {translated.category_label}",
            f"Impact Score: {translated.impact_score}/100",
        ]

        if translated.admin_impact_note:
            lines.append(f"Admin Impact: {translated.admin_impact_note}")

        if include_scenarios and translated.abuse_scenarios:
            lines.append("Potential Abuse Scenarios:")
            for scenario in translated.abuse_scenarios:
                lines.append(f"  • {scenario}")

        if not translated.is_known:
            lines.append("")
            lines.append("⚠ This permission is not in the rules database.")
            lines.append("  Please review the raw permission documentation.")

        return "\n".join(lines)

    def _parse_category(self, category_str: str) -> RiskCategory:
        """Parse category string to RiskCategory enum."""
        mapping = {
            "read_only": RiskCategory.READ_ONLY,
            "data_exfiltration": RiskCategory.DATA_EXFILTRATION,
            "privilege_escalation": RiskCategory.PRIVILEGE_ESCALATION,
            "tenant_takeover": RiskCategory.TENANT_TAKEOVER,
            "persistence": RiskCategory.PERSISTENCE,
            "lateral_movement": RiskCategory.LATERAL_MOVEMENT,
        }
        return mapping.get(category_str.lower(), RiskCategory.UNKNOWN)

    @property
    def known_permission_count(self) -> int:
        """Number of permissions in the rules database."""
        return len(self.rules)

    def reload_rules(self, rules_path: Path | str | None = None) -> None:
        """Reload rules from file."""
        if rules_path:
            self.rules_path = Path(rules_path)
        self.rules.clear()
        self._load_rules()