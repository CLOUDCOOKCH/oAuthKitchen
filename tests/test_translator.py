"""Tests for the permission translator."""

import pytest
from pathlib import Path

from oauthkitchen.analyzers.translator import PermissionTranslator
from oauthkitchen.models import RiskCategory


class TestPermissionTranslator:
    """Tests for PermissionTranslator."""

    @pytest.fixture
    def translator(self) -> PermissionTranslator:
        """Create a translator with default rules."""
        return PermissionTranslator()

    def test_translate_known_high_impact_permission(self, translator: PermissionTranslator):
        """Test translating a known high-impact permission."""
        result = translator.translate("Directory.ReadWrite.All")

        assert result.is_known
        assert result.permission == "Directory.ReadWrite.All"
        assert result.category == RiskCategory.TENANT_TAKEOVER
        assert result.impact_score == 100
        assert len(result.abuse_scenarios) > 0
        assert result.admin_impact_note is not None

    def test_translate_known_read_only_permission(self, translator: PermissionTranslator):
        """Test translating a known read-only permission."""
        result = translator.translate("User.Read")

        assert result.is_known
        assert result.category == RiskCategory.READ_ONLY
        assert result.impact_score < 30

    def test_translate_mail_read_permission(self, translator: PermissionTranslator):
        """Test translating Mail.Read permission."""
        result = translator.translate("Mail.Read")

        assert result.is_known
        assert result.category == RiskCategory.DATA_EXFILTRATION
        assert result.impact_score >= 70
        assert "exfiltrate" in result.plain_english.lower() or "read" in result.plain_english.lower()

    def test_translate_unknown_permission(self, translator: PermissionTranslator):
        """Test translating an unknown permission."""
        result = translator.translate("Custom.Unknown.Scope")

        assert not result.is_known
        assert result.category == RiskCategory.UNKNOWN
        assert result.impact_score == 30  # Default moderate score
        assert "Custom.Unknown.Scope" in result.permission

    def test_translate_case_insensitive(self, translator: PermissionTranslator):
        """Test that translation is case-insensitive."""
        result1 = translator.translate("Mail.Read")
        result2 = translator.translate("mail.read")
        result3 = translator.translate("MAIL.READ")

        # All should resolve to the same permission
        assert result1.category == result2.category == result3.category
        assert result1.impact_score == result2.impact_score == result3.impact_score

    def test_translate_many(self, translator: PermissionTranslator):
        """Test translating multiple permissions at once."""
        permissions = ["User.Read", "Mail.Read", "Directory.ReadWrite.All"]
        results = translator.translate_many(permissions)

        assert len(results) == 3
        assert results[0].permission == "User.Read"
        assert results[1].permission == "Mail.Read"
        assert results[2].permission == "Directory.ReadWrite.All"

    def test_get_high_impact_permissions(self, translator: PermissionTranslator):
        """Test getting high-impact permissions."""
        high_impact = translator.get_high_impact_permissions(min_score=70)

        assert len(high_impact) > 0
        for perm_name, translated in high_impact:
            assert translated.impact_score >= 70

    def test_format_permission_report(self, translator: PermissionTranslator):
        """Test formatting a permission report."""
        report = translator.format_permission_report("Mail.ReadWrite", include_scenarios=True)

        assert "Mail.ReadWrite" in report
        assert "Resource:" in report
        assert "Risk Category:" in report
        assert "Impact Score:" in report
        assert "Potential Abuse Scenarios:" in report

    def test_format_permission_report_without_scenarios(self, translator: PermissionTranslator):
        """Test formatting a permission report without abuse scenarios."""
        report = translator.format_permission_report("Mail.Read", include_scenarios=False)

        assert "Mail.Read" in report
        assert "Potential Abuse Scenarios:" not in report

    def test_category_labels(self, translator: PermissionTranslator):
        """Test that category labels are human-readable."""
        result = translator.translate("Directory.ReadWrite.All")

        assert result.category_label == "Tenant takeover potential"

        result2 = translator.translate("Mail.Read")
        assert result2.category_label == "Data exfiltration"

    def test_known_permission_count(self, translator: PermissionTranslator):
        """Test that we have a reasonable number of known permissions."""
        count = translator.known_permission_count

        # We defined 20+ permissions in the rules file
        assert count >= 20

    def test_offline_access_permission(self, translator: PermissionTranslator):
        """Test offline_access permission is properly categorized."""
        result = translator.translate("offline_access")

        assert result.is_known
        assert result.category == RiskCategory.PERSISTENCE
        # offline_access is a persistence concern but not extremely high risk on its own
        assert 30 <= result.impact_score <= 50