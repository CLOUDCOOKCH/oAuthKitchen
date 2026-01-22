from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta

from ..database import get_db, Scan, Finding, TenantConfig, User
from ..schemas import DashboardStats
from ..auth import get_current_user

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cutoff_date = datetime.utcnow() - timedelta(days=days)

    # Get tenant IDs for current user
    tenant_result = await db.execute(
        select(TenantConfig.id).where(TenantConfig.owner_id == current_user.id)
    )
    tenant_ids = [t for t in tenant_result.scalars().all()]

    if not tenant_ids:
        return DashboardStats(
            total_tenants=0,
            total_scans=0,
            total_findings=0,
            critical_findings=0,
            high_findings=0,
            medium_findings=0,
            low_findings=0,
            apps_scanned=0,
            recent_scans=[],
            top_risky_apps=[],
            findings_by_type={},
            findings_trend=[],
        )

    # Total tenants
    total_tenants = len(tenant_ids)

    # Total scans
    scan_count = await db.execute(
        select(func.count(Scan.id)).where(Scan.tenant_config_id.in_(tenant_ids))
    )
    total_scans = scan_count.scalar() or 0

    # Findings counts
    finding_counts = await db.execute(
        select(
            func.count(Finding.id).label("total"),
            func.sum(func.cast(Finding.severity == "critical", Integer)).label("critical"),
            func.sum(func.cast(Finding.severity == "high", Integer)).label("high"),
            func.sum(func.cast(Finding.severity == "medium", Integer)).label("medium"),
            func.sum(func.cast(Finding.severity == "low", Integer)).label("low"),
        )
        .join(Scan)
        .where(Scan.tenant_config_id.in_(tenant_ids))
    )
    counts = finding_counts.one()

    # Apps scanned
    apps_result = await db.execute(
        select(func.sum(Scan.apps_scanned)).where(Scan.tenant_config_id.in_(tenant_ids))
    )
    apps_scanned = apps_result.scalar() or 0

    # Recent scans
    recent_result = await db.execute(
        select(Scan)
        .where(Scan.tenant_config_id.in_(tenant_ids))
        .order_by(Scan.created_at.desc())
        .limit(5)
    )
    recent_scans = [
        {
            "id": s.id,
            "status": s.status,
            "findings_count": s.findings_count,
            "created_at": s.created_at.isoformat(),
        }
        for s in recent_result.scalars().all()
    ]

    # Top risky apps
    risky_apps_result = await db.execute(
        select(Finding.app_name, func.max(Finding.risk_score).label("max_score"))
        .join(Scan)
        .where(Scan.tenant_config_id.in_(tenant_ids), Finding.app_name.isnot(None))
        .group_by(Finding.app_name)
        .order_by(func.max(Finding.risk_score).desc())
        .limit(5)
    )
    top_risky_apps = [
        {"app_name": r[0], "risk_score": r[1]}
        for r in risky_apps_result.all()
    ]

    # Findings by type
    type_result = await db.execute(
        select(Finding.finding_type, func.count(Finding.id))
        .join(Scan)
        .where(Scan.tenant_config_id.in_(tenant_ids))
        .group_by(Finding.finding_type)
    )
    findings_by_type = {r[0]: r[1] for r in type_result.all()}

    return DashboardStats(
        total_tenants=total_tenants,
        total_scans=total_scans,
        total_findings=counts.total or 0,
        critical_findings=counts.critical or 0,
        high_findings=counts.high or 0,
        medium_findings=counts.medium or 0,
        low_findings=counts.low or 0,
        apps_scanned=apps_scanned,
        recent_scans=recent_scans,
        top_risky_apps=top_risky_apps,
        findings_by_type=findings_by_type,
        findings_trend=[],
    )


# Need to import Integer for cast
from sqlalchemy import Integer
