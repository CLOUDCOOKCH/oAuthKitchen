"""HTML report generator."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from oauthkitchen import __version__
from oauthkitchen.models import AnalysisResult
from oauthkitchen.reporters.base import BaseReporter


class HTMLReporter(BaseReporter):
    """Generates interactive HTML reports."""

    TEMPLATE_FILE = "report.html"

    def generate(self, result: AnalysisResult) -> Path:
        """
        Generate an HTML report.

        Args:
            result: Analysis result data

        Returns:
            Path to generated HTML file
        """
        self.ensure_output_dir()

        # Load Jinja2 template
        template_dir = Path(__file__).parent.parent / "templates"
        env = Environment(
            loader=FileSystemLoader(template_dir),
            autoescape=select_autoescape(["html", "xml"])
        )
        template = env.get_template(self.TEMPLATE_FILE)

        # Count risk levels
        risk_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for score in result.risk_scores.values():
            if score.risk_level in risk_counts:
                risk_counts[score.risk_level] += 1

        # Prepare template data
        data = {
            "tenant_id": result.tenant_id,
            "timestamp": result.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "mode": result.mode,
            "sign_in_data_available": result.sign_in_data_available,
            "version": __version__,

            # KPIs
            "total_apps": result.total_apps,
            "total_service_principals": result.total_service_principals,
            "critical_count": result.critical_count,
            "high_risk_count": result.high_risk_count,
            "apps_without_owners": result.apps_without_owners,
            "expiring_credentials_30_days": result.expiring_credentials_30_days,

            # Data
            "top_risky_apps": result.top_risky_apps,
            "shadow_findings": result.shadow_findings,
            "credential_findings": result.credential_findings,
            "service_principals": result.service_principals,
            "risk_scores": result.risk_scores,

            # Risk counts
            "medium_count": risk_counts["Medium"],
            "low_count": risk_counts["Low"],

            # Config
            "include_remediation": self.config.output.include_remediation_suggestions,
        }

        # Render template
        html_content = template.render(**data)

        # Write output
        output_file = self.output_dir / f"oauthkitchen_report_{result.tenant_id}.html"
        output_file.write_text(html_content, encoding="utf-8")

        self.logger.info("Generated HTML report: %s", output_file)
        return output_file