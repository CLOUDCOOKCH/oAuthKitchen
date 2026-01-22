import asyncio
from datetime import datetime
import random


async def run_scan_task(scan_id: int):
    """Background task to run a scan. This is a mock implementation."""
    from ..database import async_session, Scan, Finding, TenantConfig

    async with async_session() as db:
        # Get the scan
        from sqlalchemy import select
        result = await db.execute(select(Scan).where(Scan.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return

        # Update to running
        scan.status = "running"
        scan.started_at = datetime.utcnow()
        await db.commit()

        # Simulate scanning
        await asyncio.sleep(3)

        # Generate mock findings
        mock_findings = [
            {
                "finding_type": "excessive_permissions",
                "severity": "critical",
                "title": "Application has Directory.ReadWrite.All permission",
                "description": "This application can modify any object in the directory, including users and groups.",
                "app_name": "Suspicious App",
                "app_id": "12345678-1234-1234-1234-123456789012",
                "permission": "Directory.ReadWrite.All",
                "risk_score": 95.0,
                "remediation": "Review if this permission is necessary. Consider using more restrictive permissions.",
            },
            {
                "finding_type": "shadow_oauth",
                "severity": "high",
                "title": "User-consented app with mail access",
                "description": "A user has consented to an external application that can read their email.",
                "app_name": "External Mail Reader",
                "app_id": "87654321-4321-4321-4321-210987654321",
                "permission": "Mail.Read",
                "risk_score": 75.0,
                "remediation": "Review user consent and consider revoking if not needed.",
            },
            {
                "finding_type": "stale_credential",
                "severity": "medium",
                "title": "Application with expired credentials still active",
                "description": "This application has credentials that expired over 90 days ago.",
                "app_name": "Legacy Integration",
                "app_id": "11111111-2222-3333-4444-555555555555",
                "permission": "User.Read.All",
                "risk_score": 55.0,
                "remediation": "Remove expired credentials or deactivate the application.",
            },
            {
                "finding_type": "excessive_permissions",
                "severity": "high",
                "title": "Application has Application.ReadWrite.All permission",
                "description": "This application can create and manage other applications.",
                "app_name": "Admin Tool",
                "app_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "permission": "Application.ReadWrite.All",
                "risk_score": 85.0,
                "remediation": "Verify this is a legitimate admin tool and monitor its usage.",
            },
            {
                "finding_type": "shadow_oauth",
                "severity": "low",
                "title": "Low-risk external application",
                "description": "An external application with minimal permissions.",
                "app_name": "Calendar Helper",
                "app_id": "99999999-8888-7777-6666-555544443333",
                "permission": "Calendars.Read",
                "risk_score": 25.0,
                "remediation": "No action needed, but review periodically.",
            },
        ]

        # Randomly select some findings
        selected_findings = random.sample(mock_findings, k=random.randint(2, len(mock_findings)))

        critical = high = medium = low = 0
        for f_data in selected_findings:
            finding = Finding(
                scan_id=scan_id,
                finding_type=f_data["finding_type"],
                severity=f_data["severity"],
                title=f_data["title"],
                description=f_data["description"],
                app_name=f_data["app_name"],
                app_id=f_data["app_id"],
                permission=f_data["permission"],
                risk_score=f_data["risk_score"],
                remediation=f_data["remediation"],
            )
            db.add(finding)
            
            if f_data["severity"] == "critical":
                critical += 1
            elif f_data["severity"] == "high":
                high += 1
            elif f_data["severity"] == "medium":
                medium += 1
            else:
                low += 1

        # Update scan with results
        scan.status = "completed"
        scan.completed_at = datetime.utcnow()
        scan.apps_scanned = random.randint(10, 50)
        scan.findings_count = len(selected_findings)
        scan.critical_count = critical
        scan.high_count = high
        scan.medium_count = medium
        scan.low_count = low

        # Update tenant last scan time
        tenant_result = await db.execute(
            select(TenantConfig).where(TenantConfig.id == scan.tenant_config_id)
        )
        tenant = tenant_result.scalar_one_or_none()
        if tenant:
            tenant.last_scan_at = datetime.utcnow()

        await db.commit()
