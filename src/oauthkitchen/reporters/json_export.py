"""JSON export for analysis results."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from oauthkitchen import __version__
from oauthkitchen.models import AnalysisResult
from oauthkitchen.reporters.base import BaseReporter


class EnhancedJSONEncoder(json.JSONEncoder):
    """JSON encoder that handles dataclasses, enums, and datetimes."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, Enum):
            return obj.value
        if isinstance(obj, set):
            return list(obj)
        if hasattr(obj, "__dataclass_fields__"):
            return asdict(obj)
        return super().default(obj)


class JSONExporter(BaseReporter):
    """Exports analysis results to JSON format."""

    def generate(self, result: AnalysisResult) -> Path:
        """
        Generate a JSON export of the analysis results.

        Args:
            result: Analysis result data

        Returns:
            Path to generated JSON file
        """
        self.ensure_output_dir()

        # Build JSON structure
        data = {
            "metadata": {
                "version": __version__,
                "tenant_id": result.tenant_id,
                "analysis_timestamp": result.analysis_timestamp,
                "mode": result.mode,
                "sign_in_data_available": result.sign_in_data_available,
            },
            "summary": {
                "total_apps": result.total_apps,
                "total_service_principals": result.total_service_principals,
                "critical_count": result.critical_count,
                "high_risk_count": result.high_risk_count,
                "apps_without_owners": result.apps_without_owners,
                "expiring_credentials_30_days": result.expiring_credentials_30_days,
            },
            "applications": [
                self._serialize_application(app)
                for app in result.applications
            ],
            "service_principals": [
                self._serialize_service_principal(sp, result.risk_scores.get(sp.object_id))
                for sp in result.service_principals
            ],
            "shadow_findings": [
                self._serialize_finding(f)
                for f in result.shadow_findings
            ],
            "credential_findings": [
                self._serialize_credential_finding(f)
                for f in result.credential_findings
            ],
        }

        # Write output
        output_file = self.output_dir / f"oauthkitchen_export_{result.tenant_id}.json"

        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, cls=EnhancedJSONEncoder)

        self.logger.info("Generated JSON export: %s", output_file)
        return output_file

    def _serialize_application(self, app: Any) -> dict[str, Any]:
        """Serialize an application to a JSON-safe dict."""
        return {
            "object_id": app.object_id,
            "app_id": app.app_id,
            "display_name": app.display_name,
            "created_datetime": app.created_datetime,
            "publisher_domain": app.publisher_domain,
            "has_verified_publisher": app.has_verified_publisher,
            "sign_in_audience": app.sign_in_audience,
            "is_multi_tenant": app.is_multi_tenant,
            "credentials": {
                "password_count": len(app.password_credentials),
                "key_count": len(app.key_credentials),
                "expiring_soon": [
                    {
                        "type": cred.credential_type.value,
                        "name": cred.display_name,
                        "days_until_expiry": days,
                    }
                    for cred, days in app.expiring_credentials
                ],
            },
            "owners": [
                {
                    "object_id": o.object_id,
                    "display_name": o.display_name,
                    "upn": o.user_principal_name,
                    "type": o.object_type,
                }
                for o in app.owners
            ],
        }

    def _serialize_service_principal(
        self,
        sp: Any,
        score: Any | None
    ) -> dict[str, Any]:
        """Serialize a service principal to a JSON-safe dict."""
        return {
            "object_id": sp.object_id,
            "app_id": sp.app_id,
            "display_name": sp.display_name,
            "created_datetime": sp.created_datetime,
            "service_principal_type": sp.service_principal_type,
            "app_type": sp.app_type.value,
            "publisher_name": sp.publisher_name,
            "has_verified_publisher": sp.has_verified_publisher,
            "app_owner_organization_id": sp.app_owner_organization_id,
            "account_enabled": sp.account_enabled,
            "has_owners": sp.has_owners,
            "owner_count": len(sp.owners),
            "permissions": {
                "delegated_scopes": list(sp.all_delegated_scopes),
                "app_roles": list(sp.all_app_role_values),
                "consent_user_count": sp.consent_user_count,
            },
            "sign_in_activity": {
                "data_available": sp.sign_in_activity.data_available
                if sp.sign_in_activity else False,
                "days_since_last_activity": sp.sign_in_activity.days_since_last_activity
                if sp.sign_in_activity else None,
            } if sp.sign_in_activity else None,
            "risk_score": {
                "total_score": score.total_score,
                "risk_level": score.risk_level,
                "factors": [
                    {
                        "name": f.name,
                        "description": f.description,
                        "score": f.score,
                        "weight": f.weight,
                        "details": f.details,
                    }
                    for f in score.factors
                ],
            } if score else None,
        }

    def _serialize_finding(self, finding: Any) -> dict[str, Any]:
        """Serialize a shadow OAuth finding."""
        return {
            "finding_type": finding.finding_type,
            "severity": finding.severity,
            "title": finding.title,
            "description": finding.description,
            "service_principal_id": finding.service_principal_id,
            "service_principal_name": finding.service_principal_name,
            "affected_scopes": finding.affected_scopes,
            "affected_user_count": finding.affected_user_count,
            "recommendation": finding.recommendation,
        }

    def _serialize_credential_finding(self, finding: Any) -> dict[str, Any]:
        """Serialize a credential expiry finding."""
        return {
            "app_id": finding.app_id,
            "app_name": finding.app_name,
            "credential_type": finding.credential_type.value,
            "credential_name": finding.credential_name,
            "expires_in_days": finding.expires_in_days,
            "expiry_date": finding.expiry_date,
            "severity": finding.severity,
        }