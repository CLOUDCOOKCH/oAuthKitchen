from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from ..database import get_db, TenantConfig, User
from ..schemas import TenantCreate, TenantUpdate, TenantResponse
from ..auth import get_current_user

router = APIRouter(prefix="/tenants", tags=["tenants"])


def tenant_to_response(tenant: TenantConfig) -> dict:
    return {
        "id": tenant.id,
        "name": tenant.name,
        "tenant_id": tenant.tenant_id,
        "client_id": tenant.client_id,
        "is_active": tenant.is_active,
        "has_secret": bool(tenant.client_secret_encrypted),
        "created_at": tenant.created_at,
        "last_scan_at": tenant.last_scan_at,
    }


@router.get("", response_model=List[TenantResponse])
async def get_tenants(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(TenantConfig).where(TenantConfig.owner_id == current_user.id)
    )
    tenants = result.scalars().all()
    return [tenant_to_response(t) for t in tenants]


@router.post("", response_model=TenantResponse)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tenant = TenantConfig(
        name=data.name,
        tenant_id=data.tenant_id,
        client_id=data.client_id,
        client_secret_encrypted=data.client_secret,  # In production, encrypt this
        owner_id=current_user.id,
    )
    db.add(tenant)
    await db.commit()
    await db.refresh(tenant)
    return tenant_to_response(tenant)


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: int,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(TenantConfig).where(
            TenantConfig.id == tenant_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if data.name is not None:
        tenant.name = data.name
    if data.client_secret is not None:
        tenant.client_secret_encrypted = data.client_secret
    if data.is_active is not None:
        tenant.is_active = data.is_active

    await db.commit()
    await db.refresh(tenant)
    return tenant_to_response(tenant)


@router.delete("/{tenant_id}")
async def delete_tenant(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(TenantConfig).where(
            TenantConfig.id == tenant_id,
            TenantConfig.owner_id == current_user.id
        )
    )
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    await db.delete(tenant)
    await db.commit()
    return {"message": "Tenant deleted"}
