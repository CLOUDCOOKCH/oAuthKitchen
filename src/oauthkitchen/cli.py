"""
OAuthKitchen CLI - OAuth Security Analysis Tool for Microsoft Entra ID

Usage:
    oauthkitchen scan --tenant <id> --output ./out --format html,md,csv
    oauthkitchen translate --permission Directory.ReadWrite.All
    oauthkitchen explain --app <appId>
    oauthkitchen baseline --init
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from oauthkitchen import __version__
from oauthkitchen.analyzers import PermissionTranslator, RiskScorer, ShadowOAuthDetector
from oauthkitchen.collectors import DataOrchestrator
from oauthkitchen.config import Config, create_sample_config
from oauthkitchen.graph_client import GraphClient, create_graph_client
from oauthkitchen.reporters import (
    CSVExporter,
    HTMLReporter,
    JSONExporter,
    MarkdownReporter,
)
from oauthkitchen.utils.logging import setup_logging, get_logger

app = typer.Typer(
    name="oauthkitchen",
    help="OAuth Security Analysis Tool for Microsoft Entra ID",
    add_completion=False,
)
console = Console()
logger = get_logger()


def version_callback(value: bool) -> None:
    """Print version and exit."""
    if value:
        console.print(f"OAuthKitchen v{__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        False,
        "--version",
        "-v",
        callback=version_callback,
        is_eager=True,
        help="Show version and exit"
    ),
) -> None:
    """OAuthKitchen - OAuth Security Analysis Tool for Microsoft Entra ID"""
    pass


@app.command()
def scan(
    tenant: str = typer.Option(
        ...,
        "--tenant",
        "-t",
        help="Tenant ID to scan"
    ),
    client_id: str = typer.Option(
        ...,
        "--client-id",
        "-c",
        help="Application (client) ID for authentication"
    ),
    client_secret: Optional[str] = typer.Option(
        None,
        "--client-secret",
        "-s",
        help="Client secret for authentication",
        envvar="OAUTHKITCHEN_CLIENT_SECRET"
    ),
    certificate: Optional[Path] = typer.Option(
        None,
        "--certificate",
        "--cert",
        help="Path to certificate file (PEM) for authentication"
    ),
    cert_password: Optional[str] = typer.Option(
        None,
        "--cert-password",
        help="Certificate password",
        envvar="OAUTHKITCHEN_CERT_PASSWORD"
    ),
    device_code: bool = typer.Option(
        False,
        "--device-code",
        help="Use device code flow for interactive authentication"
    ),
    output: Path = typer.Option(
        Path("./oauthkitchen-output"),
        "--output",
        "-o",
        help="Output directory"
    ),
    format: str = typer.Option(
        "html,md,csv",
        "--format",
        "-f",
        help="Output formats (comma-separated: html,md,csv,json)"
    ),
    config_file: Optional[Path] = typer.Option(
        None,
        "--config",
        help="Path to configuration file (YAML/JSON)"
    ),
    mode: str = typer.Option(
        "auto",
        "--mode",
        "-m",
        help="Analysis mode: auto, full, or limited"
    ),
    include_remediation: bool = typer.Option(
        False,
        "--include-remediation",
        help="Include remediation suggestions in report"
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        help="Enable verbose logging"
    ),
) -> None:
    """
    Scan a tenant for OAuth security issues.

    Performs full analysis including:
    - OAuth App Consent Analysis
    - Shadow OAuth Detection
    - Risk Scoring
    - Credential Hygiene Check
    """
    setup_logging(verbose=verbose)

    console.print(Panel.fit(
        "[bold blue]OAuthKitchen[/bold blue] - OAuth Security Analysis",
        subtitle=f"v{__version__}"
    ))

    # Load or create config
    if config_file and config_file.exists():
        config = Config.from_file(config_file)
        console.print(f"[dim]Loaded config from: {config_file}[/dim]")
    else:
        config = Config()

    # Override with CLI options
    config.auth.tenant_id = tenant
    config.auth.client_id = client_id
    config.auth.client_secret = client_secret
    config.auth.certificate_path = str(certificate) if certificate else None
    config.auth.certificate_password = cert_password
    config.auth.use_device_code = device_code
    config.output.output_directory = str(output)
    config.output.include_remediation_suggestions = include_remediation
    config.mode = mode
    config.verbose = verbose

    # Parse formats
    formats = [f.strip().lower() for f in format.split(",")]
    config.output.formats = formats
    config.output.include_json = "json" in formats

    # Validate auth
    if not (client_secret or certificate or device_code):
        console.print(
            "[red]Error:[/red] Must provide --client-secret, --certificate, or --device-code"
        )
        raise typer.Exit(1)

    try:
        # Authenticate
        console.print("\n[bold]Authenticating...[/bold]")
        client = create_graph_client(config)
        console.print("[green]✓[/green] Authentication successful")

        # Collect data
        console.print("\n[bold]Collecting data...[/bold]")
        orchestrator = DataOrchestrator(client, config)
        result = orchestrator.collect_all()
        console.print(
            f"[green]✓[/green] Collected {result.total_apps} apps, "
            f"{result.total_service_principals} service principals"
        )

        # Run analysis
        console.print("\n[bold]Analyzing...[/bold]")

        # Permission translation and risk scoring
        translator = PermissionTranslator()
        scorer = RiskScorer(config, translator)
        scorer.score_all(result)
        console.print(f"[green]✓[/green] Risk scoring complete")

        # Shadow OAuth detection
        detector = ShadowOAuthDetector(config, translator)
        detector.detect(result)
        console.print(f"[green]✓[/green] Found {len(result.shadow_findings)} shadow OAuth findings")

        # Generate reports
        console.print("\n[bold]Generating reports...[/bold]")
        output_dir = Path(config.output.output_directory)

        if "html" in formats:
            html_reporter = HTMLReporter(config, output_dir)
            html_path = html_reporter.generate(result)
            console.print(f"[green]✓[/green] HTML report: {html_path}")

        if "md" in formats:
            md_reporter = MarkdownReporter(config, output_dir)
            md_path = md_reporter.generate(result)
            console.print(f"[green]✓[/green] Markdown report: {md_path}")

        if "csv" in formats:
            csv_exporter = CSVExporter(config, output_dir)
            csv_dir = csv_exporter.generate(result)
            console.print(f"[green]✓[/green] CSV exports: {csv_dir}")

        if "json" in formats:
            json_exporter = JSONExporter(config, output_dir)
            json_path = json_exporter.generate(result)
            console.print(f"[green]✓[/green] JSON export: {json_path}")

        # Print summary
        console.print("\n")
        _print_summary(result)

    except Exception as e:
        console.print(f"\n[red]Error:[/red] {e}")
        if verbose:
            console.print_exception()
        raise typer.Exit(1)


@app.command()
def translate(
    permission: str = typer.Argument(
        ...,
        help="Permission name to translate (e.g., Directory.ReadWrite.All)"
    ),
    resource: str = typer.Option(
        "microsoft_graph",
        "--resource",
        "-r",
        help="Resource API (default: microsoft_graph)"
    ),
) -> None:
    """
    Translate a permission name to plain English with risk context.

    Example: oauthkitchen translate Mail.Read
    """
    translator = PermissionTranslator()
    report = translator.format_permission_report(permission, include_scenarios=True)

    console.print(Panel(
        report,
        title=f"Permission: {permission}",
        border_style="blue"
    ))


@app.command()
def explain(
    app_id: str = typer.Argument(
        ...,
        help="App ID or Object ID of the application"
    ),
    tenant: str = typer.Option(
        ...,
        "--tenant",
        "-t",
        help="Tenant ID"
    ),
    client_id: str = typer.Option(
        ...,
        "--client-id",
        "-c",
        help="Application (client) ID for authentication"
    ),
    client_secret: Optional[str] = typer.Option(
        None,
        "--client-secret",
        "-s",
        help="Client secret for authentication",
        envvar="OAUTHKITCHEN_CLIENT_SECRET"
    ),
    certificate: Optional[Path] = typer.Option(
        None,
        "--certificate",
        "--cert",
        help="Path to certificate file for authentication"
    ),
    device_code: bool = typer.Option(
        False,
        "--device-code",
        help="Use device code flow"
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        help="Enable verbose output"
    ),
) -> None:
    """
    Explain a specific application's permissions and risk factors.

    Example: oauthkitchen explain <app-id> --tenant <tenant-id> --client-id <client-id>
    """
    setup_logging(verbose=verbose)

    # Build config
    config = Config()
    config.auth.tenant_id = tenant
    config.auth.client_id = client_id
    config.auth.client_secret = client_secret
    config.auth.certificate_path = str(certificate) if certificate else None
    config.auth.use_device_code = device_code
    config.verbose = verbose

    if not (client_secret or certificate or device_code):
        console.print(
            "[red]Error:[/red] Must provide --client-secret, --certificate, or --device-code"
        )
        raise typer.Exit(1)

    try:
        # Authenticate
        console.print("[dim]Authenticating...[/dim]")
        client = create_graph_client(config)

        # Collect single app
        console.print(f"[dim]Looking up app: {app_id}[/dim]")
        orchestrator = DataOrchestrator(client, config)
        application, sp = orchestrator.collect_single_app(app_id)

        if not application and not sp:
            console.print(f"[red]Error:[/red] App not found: {app_id}")
            raise typer.Exit(1)

        # Analyze
        translator = PermissionTranslator()
        scorer = RiskScorer(config, translator)

        # Print app details
        console.print("\n")

        if application:
            _print_application_details(application)

        if sp:
            score = scorer.score_service_principal(sp)
            _print_service_principal_details(sp, score, translator)

    except Exception as e:
        console.print(f"\n[red]Error:[/red] {e}")
        if verbose:
            console.print_exception()
        raise typer.Exit(1)


@app.command()
def baseline(
    init: bool = typer.Option(
        False,
        "--init",
        help="Create a sample configuration file"
    ),
    output: Path = typer.Option(
        Path("oauthkitchen.yaml"),
        "--output",
        "-o",
        help="Output path for config file"
    ),
) -> None:
    """
    Create a baseline configuration file.

    Example: oauthkitchen baseline --init
    """
    if not init:
        console.print("Use --init to create a sample configuration file")
        raise typer.Exit(0)

    config = create_sample_config()

    # Save config
    config.save(output)
    console.print(f"[green]✓[/green] Created sample config: {output}")
    console.print("\n[dim]Edit this file to configure authentication and scoring weights.[/dim]")


def _print_summary(result) -> None:
    """Print analysis summary."""
    table = Table(title="Analysis Summary", show_header=False)
    table.add_column("Metric", style="bold")
    table.add_column("Value", justify="right")

    table.add_row("Total App Registrations", str(result.total_apps))
    table.add_row("Total Service Principals", str(result.total_service_principals))
    table.add_row("Critical Risk", f"[red]{result.critical_count}[/red]")
    table.add_row("High Risk", f"[yellow]{result.high_risk_count}[/yellow]")
    table.add_row("Shadow OAuth Findings", str(len(result.shadow_findings)))
    table.add_row("Apps Without Owners", str(result.apps_without_owners))
    table.add_row("Credentials Expiring <30d", str(result.expiring_credentials_30_days))
    table.add_row("Mode", result.mode)

    console.print(table)

    if result.critical_count > 0 or result.high_risk_count > 0:
        console.print(
            "\n[yellow]⚠ High/Critical risk apps detected. "
            "Review the generated reports for details.[/yellow]"
        )


def _print_application_details(app) -> None:
    """Print application registration details."""
    console.print(Panel(
        f"[bold]{app.display_name}[/bold]\n"
        f"App ID: {app.app_id}\n"
        f"Object ID: {app.object_id}\n"
        f"Publisher Domain: {app.publisher_domain or 'N/A'}\n"
        f"Verified Publisher: {'Yes' if app.has_verified_publisher else 'No'}\n"
        f"Multi-tenant: {'Yes' if app.is_multi_tenant else 'No'}\n"
        f"Owners: {len(app.owners)}\n"
        f"Password Credentials: {len(app.password_credentials)}\n"
        f"Certificate Credentials: {len(app.key_credentials)}",
        title="Application Registration",
        border_style="blue"
    ))


def _print_service_principal_details(sp, score, translator) -> None:
    """Print service principal details with risk analysis."""
    # Basic info
    console.print(Panel(
        f"[bold]{sp.display_name}[/bold]\n"
        f"Object ID: {sp.object_id}\n"
        f"App Type: {sp.app_type.value}\n"
        f"Publisher: {sp.publisher_name or 'Unknown'}\n"
        f"Verified Publisher: {'Yes' if sp.has_verified_publisher else 'No'}\n"
        f"Enabled: {'Yes' if sp.account_enabled else 'No'}\n"
        f"Owners: {len(sp.owners)}",
        title="Service Principal",
        border_style="blue"
    ))

    # Permissions
    perm_table = Table(title="Permissions")
    perm_table.add_column("Type")
    perm_table.add_column("Permission")
    perm_table.add_column("Category")
    perm_table.add_column("Impact")

    for scope in sp.all_delegated_scopes:
        translated = translator.translate(scope)
        perm_table.add_row(
            "Delegated",
            scope,
            translated.category_label,
            str(translated.impact_score)
        )

    for role in sp.all_app_role_values:
        if role and role != "Default Access":
            translated = translator.translate(role)
            perm_table.add_row(
                "Application",
                role,
                translated.category_label,
                str(translated.impact_score)
            )

    console.print(perm_table)

    # Risk score
    console.print(Panel(
        f"[bold]Risk Level: {score.risk_level}[/bold]\n"
        f"Total Score: {score.total_score}/100\n\n"
        f"{score.breakdown_text}",
        title="Risk Analysis",
        border_style="red" if score.risk_level in ["Critical", "High"] else "yellow"
    ))


if __name__ == "__main__":
    app()