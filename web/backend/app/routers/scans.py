from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime

from ..database import get_db, Scan, TenantConfig, Finding, User
from ..schemas import ScanCreate, ScanResponse, FindingResponse, AcknowledgeRequest
from ..auth import get_current_user
from ..services.scanner import run_scan_task

router = APIRouter(prefix="/scans", tags=["scans"])


@router.get("", response_model=List[ScanResponse])
async def get_scans(
    tenant_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Scan).join(TenantConfig).where(TenantConfig.owner_id == current_user.id)
    
    if tenant_id:
        query = query.where(Scan.tenant_config_id == tenant_id)
    if status:
        query = query.where(Scan.status == status)
    
    query = query.order_by(Scan.created_at.desc())
    result = await db.execute(query.options(selectinload(Scan.tenant_config)))
    scans = result.scalars().all()
    
    return [
        ScanResponse(
            id=s.id,
            tenant_config_id=s.tenant_config_id,
            status=s.status,
            mode=s.mode,
            started_at=s.started_at,
            completed_at=s.completed_at,
            apps_scanned=s.apps_scanned,
            findings_count=s.findings_count,
            critical_count=s.critical_count,
            high_count=s.high_count,
            medium_count=s.medium_count,
            low_count=s.low_count,
            error_message=s.error_message,
            created_at=s.created_at,
            tenant_name=s.tenant_config.name if s.tenant_config else None,
        )
        for s in scans
    ]


@router.post("", response_model=ScanResponse)
async def create_scan(
    data: ScanCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify tenant ownership
    result = await db.execute(
        select(TenantConfig).where(
            TenantConfig.id == data.tenant_config_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Create scan
    scan = Scan(
        tenant_config_id=data.tenant_config_id,
        user_id=current_user.id,
        mode=data.mode,
        status="pending",
    )
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # Start background scan
    background_tasks.add_task(run_scan_task, scan.id)

    return ScanResponse(
        id=scan.id,
        tenant_config_id=scan.tenant_config_id,
        status=scan.status,
        mode=scan.mode,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        apps_scanned=scan.apps_scanned,
        findings_count=scan.findings_count,
        critical_count=scan.critical_count,
        high_count=scan.high_count,
        medium_count=scan.medium_count,
        low_count=scan.low_count,
        error_message=scan.error_message,
        created_at=scan.created_at,
        tenant_name=tenant.name,
    )


@router.get("/{scan_id}", response_model=ScanResponse)
async def get_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Scan)
        .join(TenantConfig)
        .where(Scan.id == scan_id, TenantConfig.owner_id == current_user.id)
        .options(selectinload(Scan.tenant_config))
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    return ScanResponse(
        id=scan.id,
        tenant_config_id=scan.tenant_config_id,
        status=scan.status,
        mode=scan.mode,
        started_at=scan.started_at,
        completed_at=scan.completed_at,
        apps_scanned=scan.apps_scanned,
        findings_count=scan.findings_count,
        critical_count=scan.critical_count,
        high_count=scan.high_count,
        medium_count=scan.medium_count,
        low_count=scan.low_count,
        error_message=scan.error_message,
        created_at=scan.created_at,
        tenant_name=scan.tenant_config.name if scan.tenant_config else None,
    )


@router.get("/{scan_id}/findings", response_model=List[FindingResponse])
async def get_scan_findings(
    scan_id: int,
    severity: Optional[str] = None,
    finding_type: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify scan ownership
    scan_result = await db.execute(
        select(Scan).join(TenantConfig).where(
            Scan.id == scan_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    if not scan_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Scan not found")

    query = select(Finding).where(Finding.scan_id == scan_id)
    
    if severity:
        query = query.where(Finding.severity == severity)
    if finding_type:
        query = query.where(Finding.finding_type == finding_type)
    if acknowledged is not None:
        query = query.where(Finding.acknowledged == acknowledged)

    result = await db.execute(query.order_by(Finding.risk_score.desc()))
    findings = result.scalars().all()

    return [FindingResponse.model_validate(f) for f in findings]


@router.patch("/{scan_id}/findings/{finding_id}/acknowledge", response_model=FindingResponse)
async def acknowledge_finding(
    scan_id: int,
    finding_id: int,
    data: AcknowledgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify ownership
    result = await db.execute(
        select(Finding)
        .join(Scan)
        .join(TenantConfig)
        .where(
            Finding.id == finding_id,
            Finding.scan_id == scan_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    finding.acknowledged = True
    finding.acknowledged_by = current_user.id
    finding.acknowledged_at = datetime.utcnow()
    finding.acknowledgement_notes = data.notes

    await db.commit()
    await db.refresh(finding)

    return FindingResponse.model_validate(finding)


@router.delete("/{scan_id}")
async def delete_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(Scan).join(TenantConfig).where(
            Scan.id == scan_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    await db.delete(scan)
    await db.commit()
    return {"message": "Scan deleted"}
