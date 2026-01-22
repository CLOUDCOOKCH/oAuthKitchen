"""Markdown report generator."""

from __future__ import annotations

from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from oauthkitchen import __version__
from oauthkitchen.models import AnalysisResult
from oauthkitchen.reporters.base import BaseReporter


class MarkdownReporter(BaseReporter):
    """Generates Markdown summary reports."""

    TEMPLATE_FILE = "summary.md"

    def generate(self, result: AnalysisResult) -> Path:
        """
        Generate a Markdown summary report.

        Args:
            result: Analysis result data

        Returns:
            Path to generated Markdown file
        """
        self.ensure_output_dir()

        # Load Jinja2 template
        template_dir = Path(__file__).parent.parent / "templates"
        env = Environment(loader=FileSystemLoader(template_dir))
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

            # Risk counts
            "medium_count": risk_counts["Medium"],
            "low_count": risk_counts["Low"],
        }

        # Render template
        md_content = template.render(**data)

        # Write output
        output_file = self.output_dir / f"oauthkitchen_summary_{result.tenant_id}.md"
        output_file.write_text(md_content, encoding="utf-8")

        self.logger.info("Generated Markdown report: %s", output_file)
        return output_file