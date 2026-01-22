"""CSV export for analysis results."""

from __future__ import annotations

import csv
from pathlib import Path

from oauthkitchen.models import AnalysisResult
from oauthkitchen.reporters.base import BaseReporter


class CSVExporter(BaseReporter):
    """Exports analysis results to CSV files."""

    def generate(self, result: AnalysisResult) -> Path:
        """
        Generate CSV exports.

        Creates multiple CSV files:
        - apps.csv: Application registrations
        - service_principals.csv: Enterprise apps with scores
        - permissions.csv: All permission grants and assignments
        - credentials.csv: Credential details
        - owners.csv: App/SP owners
        - findings.csv: Shadow OAuth findings

        Args:
            result: Analysis result data

        Returns:
            Path to output directory containing CSV files
        """
        self.ensure_output_dir()

        # Create CSV subdirectory
        csv_dir = self.output_dir / "csv"
        csv_dir.mkdir(exist_ok=True)

        # Export each CSV
        self._export_apps(result, csv_dir)
        self._export_service_principals(result, csv_dir)
        self._export_permissions(result, csv_dir)
        self._export_credentials(result, csv_dir)
        self._export_owners(result, csv_dir)
        self._export_findings(result, csv_dir)

        self.logger.info("Generated CSV exports in: %s", csv_dir)
        return csv_dir

    def _export_apps(self, result: AnalysisResult, output_dir: Path) -> None:
        """Export applications to CSV."""
        output_file = output_dir / "apps.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "object_id",
                "app_id",
                "display_name",
                "created_datetime",
                "publisher_domain",
                "has_verified_publisher",
                "sign_in_audience",
                "is_multi_tenant",
                "password_credential_count",
                "key_credential_count",
                "owner_count",
                "has_owners",
            ])

            for app in result.applications:
                writer.writerow([
                    app.object_id,
                    app.app_id,
                    app.display_name,
                    app.created_datetime.isoformat() if app.created_datetime else "",
                    app.publisher_domain or "",
                    app.has_verified_publisher,
                    app.sign_in_audience or "",
                    app.is_multi_tenant,
                    len(app.password_credentials),
                    len(app.key_credentials),
                    len(app.owners),
                    app.has_owners,
                ])

    def _export_service_principals(
        self,
        result: AnalysisResult,
        output_dir: Path
    ) -> None:
        """Export service principals to CSV."""
        output_file = output_dir / "service_principals.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "object_id",
                "app_id",
                "display_name",
                "created_datetime",
                "service_principal_type",
                "app_type",
                "publisher_name",
                "has_verified_publisher",
                "app_owner_organization_id",
                "account_enabled",
                "owner_count",
                "delegated_scope_count",
                "app_role_count",
                "consent_user_count",
                "risk_score",
                "risk_level",
            ])

            for sp in result.service_principals:
                score = result.risk_scores.get(sp.object_id)
                writer.writerow([
                    sp.object_id,
                    sp.app_id,
                    sp.display_name,
                    sp.created_datetime.isoformat() if sp.created_datetime else "",
                    sp.service_principal_type or "",
                    sp.app_type.value,
                    sp.publisher_name or "",
                    sp.has_verified_publisher,
                    sp.app_owner_organization_id or "",
                    sp.account_enabled,
                    len(sp.owners),
                    len(sp.all_delegated_scopes),
                    len(sp.all_app_role_values),
                    sp.consent_user_count,
                    score.total_score if score else "",
                    score.risk_level if score else "",
                ])

    def _export_permissions(self, result: AnalysisResult, output_dir: Path) -> None:
        """Export all permissions to CSV."""
        output_file = output_dir / "permissions.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "sp_object_id",
                "sp_display_name",
                "permission_type",
                "permission_value",
                "resource_id",
                "consent_type",
                "principal_id",
            ])

            for sp in result.service_principals:
                # Delegated permissions
                for grant in sp.oauth2_permission_grants:
                    for scope in grant.scopes:
                        writer.writerow([
                            sp.object_id,
                            sp.display_name,
                            "delegated",
                            scope,
                            grant.resource_id,
                            grant.consent_type.value,
                            grant.principal_id or "",
                        ])

                # Application permissions
                for assignment in sp.app_role_assignments:
                    writer.writerow([
                        sp.object_id,
                        sp.display_name,
                        "application",
                        assignment.role_value or assignment.app_role_id,
                        assignment.resource_id,
                        "application",
                        "",
                    ])

    def _export_credentials(self, result: AnalysisResult, output_dir: Path) -> None:
        """Export credentials to CSV."""
        output_file = output_dir / "credentials.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "app_object_id",
                "app_id",
                "app_display_name",
                "credential_id",
                "credential_type",
                "display_name",
                "start_datetime",
                "end_datetime",
                "days_until_expiry",
                "is_expired",
                "age_days",
            ])

            for app in result.applications:
                for cred in app.all_credentials:
                    writer.writerow([
                        app.object_id,
                        app.app_id,
                        app.display_name,
                        cred.credential_id,
                        cred.credential_type.value,
                        cred.display_name or "",
                        cred.start_datetime.isoformat() if cred.start_datetime else "",
                        cred.end_datetime.isoformat() if cred.end_datetime else "",
                        cred.days_until_expiry if cred.days_until_expiry is not None else "",
                        cred.is_expired,
                        cred.age_days if cred.age_days is not None else "",
                    ])

    def _export_owners(self, result: AnalysisResult, output_dir: Path) -> None:
        """Export owners to CSV."""
        output_file = output_dir / "owners.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "entity_type",
                "entity_object_id",
                "entity_display_name",
                "owner_object_id",
                "owner_display_name",
                "owner_upn",
                "owner_type",
            ])

            # App owners
            for app in result.applications:
                for owner in app.owners:
                    writer.writerow([
                        "application",
                        app.object_id,
                        app.display_name,
                        owner.object_id,
                        owner.display_name or "",
                        owner.user_principal_name or "",
                        owner.object_type,
                    ])

            # SP owners
            for sp in result.service_principals:
                for owner in sp.owners:
                    writer.writerow([
                        "service_principal",
                        sp.object_id,
                        sp.display_name,
                        owner.object_id,
                        owner.display_name or "",
                        owner.user_principal_name or "",
                        owner.object_type,
                    ])

    def _export_findings(self, result: AnalysisResult, output_dir: Path) -> None:
        """Export shadow OAuth findings to CSV."""
        output_file = output_dir / "findings.csv"

        with open(output_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow([
                "finding_type",
                "severity",
                "title",
                "description",
                "service_principal_id",
                "service_principal_name",
                "affected_scopes",
                "affected_user_count",
                "recommendation",
            ])

            for finding in result.shadow_findings:
                writer.writerow([
                    finding.finding_type,
                    finding.severity,
                    finding.title,
                    finding.description,
                    finding.service_principal_id,
                    finding.service_principal_name,
                    ";".join(finding.affected_scopes),
                    finding.affected_user_count,
                    finding.recommendation or "",
                ])