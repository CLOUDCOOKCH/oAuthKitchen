from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime


# Auth
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Tenants
class TenantCreate(BaseModel):
    name: str
    tenant_id: str
    client_id: str
    client_secret: Optional[str] = None


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    client_secret: Optional[str] = None
    is_active: Optional[bool] = None


class TenantResponse(BaseModel):
    id: int
    name: str
    tenant_id: str
    client_id: str
    is_active: bool
    has_secret: bool
    created_at: datetime
    last_scan_at: Optional[datetime]

    class Config:
        from_attributes = True


# Scans
class ScanCreate(BaseModel):
    tenant_config_id: int
    mode: str = "auto"


class ScanResponse(BaseModel):
    id: int
    tenant_config_id: int
    status: str
    mode: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    apps_scanned: int
    findings_count: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    error_message: Optional[str]
    created_at: datetime
    tenant_name: Optional[str] = None

    class Config:
        from_attributes = True


# Findings
class FindingResponse(BaseModel):
    id: int
    finding_type: str
    severity: str
    title: str
    description: Optional[str]
    app_id: Optional[str]
    app_name: Optional[str]
    permission: Optional[str]
    risk_score: Optional[float]
    remediation: Optional[str]
    acknowledged: bool
    acknowledged_at: Optional[datetime]
    acknowledgement_notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class AcknowledgeRequest(BaseModel):
    notes: Optional[str] = None


# Dashboard
class DashboardStats(BaseModel):
    total_tenants: int
    total_scans: int
    total_findings: int
    critical_findings: int
    high_findings: int
    medium_findings: int
    low_findings: int
    apps_scanned: int
    recent_scans: list
    top_risky_apps: list
    findings_by_type: dict
    findings_trend: list


# Permissions
class PermissionTranslation(BaseModel):
    permission: str
    resource: str = "microsoft_graph"
    plain_english: str
    category: str
    category_label: str
    impact_score: int
    abuse_scenarios: list[str]
    admin_impact_note: Optional[str] = None
    is_known: bool = True
