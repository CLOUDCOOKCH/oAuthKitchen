"""Permission translation endpoints."""

from typing import List

from fastapi import APIRouter, Query

from app.schemas import PermissionTranslation

router = APIRouter(prefix="/permissions", tags=["Permissions"])

# Import the translator from the core package
# In production, this would be: from oauthkitchen.analyzers import PermissionTranslator
# For now, we'll create a simple mock that mimics the behavior


class MockTranslator:
    """Mock translator for development without full oauthkitchen install."""

    PERMISSIONS = {
        "directory.readwrite.all": {
            "permission": "Directory.ReadWrite.All",
            "resource": "microsoft_graph",
            "plain_english": "Can modify all directory objects including users, groups, and applications",
            "category": "tenant_takeover",
            "category_label": "Tenant takeover potential",
            "impact_score": 100,
            "abuse_scenarios": [
                "Create new admin users or elevate existing users to admin roles",
                "Modify group memberships to gain access to resources",
                "Alter application configurations to gain persistent access",
            ],
            "admin_impact_note": "Could enable actions similar to Global Administrator",
            "is_known": True,
        },
        "mail.read": {
            "permission": "Mail.Read",
            "resource": "microsoft_graph",
            "plain_english": "Can read all emails in user mailboxes",
            "category": "data_exfiltration",
            "category_label": "Data exfiltration",
            "impact_score": 70,
            "abuse_scenarios": [
                "Exfiltrate sensitive business communications",
                "Harvest password reset emails or MFA codes",
                "Gather reconnaissance for further attacks",
            ],
            "admin_impact_note": None,
            "is_known": True,
        },
        "mail.readwrite": {
            "permission": "Mail.ReadWrite",
            "resource": "microsoft_graph",
            "plain_english": "Can read, write, and delete emails in user mailboxes",
            "category": "data_exfiltration",
            "category_label": "Data exfiltration",
            "impact_score": 75,
            "abuse_scenarios": [
                "Exfiltrate sensitive email content",
                "Create inbox rules to forward emails",
                "Delete evidence of compromise from mailboxes",
            ],
            "admin_impact_note": None,
            "is_known": True,
        },
        "user.read": {
            "permission": "User.Read",
            "resource": "microsoft_graph",
            "plain_english": "Can read the signed-in user's profile",
            "category": "read_only",
            "category_label": "Read-only",
            "impact_score": 10,
            "abuse_scenarios": ["Basic user enumeration"],
            "admin_impact_note": "Standard OpenID Connect scope",
            "is_known": True,
        },
        "files.readwrite.all": {
            "permission": "Files.ReadWrite.All",
            "resource": "microsoft_graph",
            "plain_english": "Can access and modify all files in SharePoint and OneDrive",
            "category": "data_exfiltration",
            "category_label": "Data exfiltration",
            "impact_score": 80,
            "abuse_scenarios": [
                "Exfiltrate sensitive documents at scale",
                "Plant malicious documents for lateral movement",
                "Delete or encrypt files (ransomware)",
            ],
            "admin_impact_note": None,
            "is_known": True,
        },
        "application.readwrite.all": {
            "permission": "Application.ReadWrite.All",
            "resource": "microsoft_graph",
            "plain_english": "Can create, modify, and delete any application registration",
            "category": "tenant_takeover",
            "category_label": "Tenant takeover potential",
            "impact_score": 95,
            "abuse_scenarios": [
                "Add credentials to any app registration for persistent access",
                "Modify app permissions to escalate privileges",
                "Create malicious applications with excessive permissions",
            ],
            "admin_impact_note": "Could enable actions similar to Application Administrator",
            "is_known": True,
        },
        "rolemanagement.readwrite.directory": {
            "permission": "RoleManagement.ReadWrite.Directory",
            "resource": "microsoft_graph",
            "plain_english": "Can manage role assignments and role definitions in Entra ID",
            "category": "tenant_takeover",
            "category_label": "Tenant takeover potential",
            "impact_score": 100,
            "abuse_scenarios": [
                "Assign Global Administrator role to any user or service principal",
                "Create custom roles with dangerous permissions",
                "Remove security roles from legitimate admins",
            ],
            "admin_impact_note": "Could enable actions similar to Privileged Role Administrator",
            "is_known": True,
        },
        "offline_access": {
            "permission": "offline_access",
            "resource": "microsoft_graph",
            "plain_english": "Allows app to receive refresh tokens for long-lived access",
            "category": "persistence",
            "category_label": "Persistence",
            "impact_score": 40,
            "abuse_scenarios": [
                "Maintain access after password change",
                "Continue accessing data without re-authentication",
                "Long-lived tokens for ongoing exfiltration",
            ],
            "admin_impact_note": "Generally expected but extends access duration",
            "is_known": True,
        },
    }

    def translate(self, permission: str) -> dict:
        key = permission.lower()
        if key in self.PERMISSIONS:
            return self.PERMISSIONS[key]
        return {
            "permission": permission,
            "resource": "unknown",
            "plain_english": f"Permission: {permission} (no translation available)",
            "category": "unknown",
            "category_label": "Unknown - requires review",
            "impact_score": 30,
            "abuse_scenarios": [],
            "admin_impact_note": None,
            "is_known": False,
        }

    def get_all_high_impact(self, min_score: int = 70) -> List[dict]:
        return [
            p for p in self.PERMISSIONS.values() if p["impact_score"] >= min_score
        ]


translator = MockTranslator()


@router.get("/translate/{permission}", response_model=PermissionTranslation)
async def translate_permission(permission: str):
    """Translate a single permission to plain English."""
    result = translator.translate(permission)
    return PermissionTranslation(**result)


@router.get("/translate", response_model=List[PermissionTranslation])
async def translate_permissions(permissions: str = Query(..., description="Comma-separated permissions")):
    """Translate multiple permissions."""
    perm_list = [p.strip() for p in permissions.split(",") if p.strip()]
    return [PermissionTranslation(**translator.translate(p)) for p in perm_list]


@router.get("/high-impact", response_model=List[PermissionTranslation])
async def get_high_impact_permissions(min_score: int = Query(70, ge=0, le=100)):
    """Get all known high-impact permissions."""
    results = translator.get_all_high_impact(min_score)
    return [PermissionTranslation(**p) for p in results]


@router.get("/categories")
async def get_permission_categories():
    """Get all permission categories with descriptions."""
    return {
        "categories": [
            {
                "id": "tenant_takeover",
                "label": "Tenant Takeover Potential",
                "description": "Permissions that could lead to full tenant compromise",
                "severity": "critical",
                "color": "#ef4444",
            },
            {
                "id": "privilege_escalation",
                "label": "Privilege Escalation",
                "description": "Permissions that could be used to gain elevated access",
                "severity": "high",
                "color": "#f97316",
            },
            {
                "id": "data_exfiltration",
                "label": "Data Exfiltration",
                "description": "Permissions that could be used to extract sensitive data",
                "severity": "high",
                "color": "#eab308",
            },
            {
                "id": "persistence",
                "label": "Persistence",
                "description": "Permissions that could be used to maintain long-term access",
                "severity": "medium",
                "color": "#a855f7",
            },
            {
                "id": "lateral_movement",
                "label": "Lateral Movement",
                "description": "Permissions that could be used to access other resources/users",
                "severity": "medium",
                "color": "#3b82f6",
            },
            {
                "id": "read_only",
                "label": "Read-only",
                "description": "Generally safe read access permissions",
                "severity": "low",
                "color": "#22c55e",
            },
            {
                "id": "unknown",
                "label": "Unknown",
                "description": "Permissions not yet categorized - requires review",
                "severity": "medium",
                "color": "#6b7280",
            },
        ]
    }