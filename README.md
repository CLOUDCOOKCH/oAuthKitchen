# 🔐 OAuthKitchen

**OAuth Security Analysis Tool for Microsoft Entra ID**

OAuthKitchen is a comprehensive CLI tool that combines three critical capabilities:
1. **OAuth App Consent Analyzer** - Risk-scored analysis of all OAuth applications
2. **Shadow OAuth Detector** - Identifies risky OAuth exposure patterns
3. **OAuth Permission Translator** - Converts raw permissions to plain English with abuse context

> ⚠️ **Important**: This tool is designed for **reporting only**. It never auto-disables apps by default. Remediation suggestions are optional and clearly separated.

## ✨ Features

- 📊 **Risk-scored analysis** of all applications and service principals
- 👻 **Shadow OAuth detection** for external apps, user consent, orphaned apps
- 📝 **Permission translation** with plain-English descriptions and abuse scenarios
- 📅 **Credential expiry tracking** with configurable thresholds
- 🔍 **Owner hygiene checking** to identify orphaned applications
- 📈 **Activity analysis** when sign-in logs are available
- 📄 **Multiple output formats**: Interactive HTML, Markdown, CSV, JSON
- 🔧 **Fully configurable** scoring weights and thresholds
- 🔐 **Multiple auth methods**: Certificate, client secret, device code
- 🖥️ **Cross-platform**: Windows, macOS, Linux

## 📋 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/oauthkitchen/oauthkitchen.git
cd oauthkitchen

# Install with pip
pip install -e .

# Or install from PyPI (when published)
pip install oauthkitchen
```

### Basic Usage

```bash
# Scan a tenant (with client secret)
oauthkitchen scan \
  --tenant YOUR_TENANT_ID \
  --client-id YOUR_APP_ID \
  --client-secret YOUR_SECRET \
  --output ./reports

# Scan with certificate (recommended for automation)
oauthkitchen scan \
  --tenant YOUR_TENANT_ID \
  --client-id YOUR_APP_ID \
  --certificate /path/to/cert.pem \
  --output ./reports

# Interactive device code flow
oauthkitchen scan \
  --tenant YOUR_TENANT_ID \
  --client-id YOUR_APP_ID \
  --device-code \
  --output ./reports

# Translate a permission
oauthkitchen translate Directory.ReadWrite.All

# Explain a specific app
oauthkitchen explain APP_ID \
  --tenant YOUR_TENANT_ID \
  --client-id YOUR_APP_ID \
  --client-secret YOUR_SECRET

# Create sample config
oauthkitchen baseline --init
```

## 🔑 Required Permissions

### Limited Mode (Default)
Minimum permissions when sign-in logs are not available:

| Permission | Type | Purpose |
|------------|------|---------|
| `Application.Read.All` | Application | Read all app registrations |
| `Directory.Read.All` | Application | Read directory objects |

### Full Mode
Additional permissions for sign-in activity analysis:

| Permission | Type | Purpose |
|------------|------|---------|
| `AuditLog.Read.All` | Application | Read sign-in logs |

> **Note**: Sign-in activity data may require Azure AD P1/P2 license.

### App Registration Setup

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Create a new registration (or use existing)
3. Add required API permissions (Application permissions, not Delegated)
4. Grant admin consent for the permissions
5. Create a client secret or upload a certificate

## 📊 Output Reports

### HTML Report
Interactive report with:
- KPI dashboard (total apps, risk counts, expiring credentials)
- Top 10 risky applications with score breakdown
- Shadow OAuth findings with affected scopes
- Credential expiry calendar
- Filterable app table

### Markdown Summary
Quick reference including:
- Executive summary with key metrics
- Top 10 findings
- Shadow OAuth findings table
- Credential expiration schedule

### CSV Exports
Machine-readable data:
- `apps.csv` - All application registrations
- `service_principals.csv` - Enterprise apps with risk scores
- `permissions.csv` - All permission grants
- `credentials.csv` - Credential details
- `owners.csv` - App/SP ownership
- `findings.csv` - Shadow OAuth findings

### JSON Export
Complete structured data for integration with other tools.

## ⚙️ Configuration

Create a config file with `oauthkitchen baseline --init` or copy `oauthkitchen.sample.yaml`:

```yaml
# Authentication
auth:
  tenant_id: "your-tenant-id"
  client_id: "your-app-id"
  # Use ONE of: client_secret, certificate_path, use_device_code

# Analysis mode: auto, full, limited
mode: auto

# Credential expiry thresholds (days)
thresholds:
  credential_expiry_critical: 7
  credential_expiry_high: 30
  credential_expiry_medium: 60
  credential_expiry_low: 90
  inactive_days_threshold: 90

# Risk scoring weights (tune as needed)
scoring:
  application_permission_multiplier: 1.5
  delegated_permission_multiplier: 1.0
  user_consent_weight: 1.2
  no_verified_publisher_weight: 1.3
  no_owner_weight: 1.3

# Output settings
output:
  output_directory: "./oauthkitchen-output"
  formats: [html, md, csv]
  include_json: true
  include_remediation_suggestions: false  # Safe default

# Allow/deny lists
allow_deny:
  allowed_app_ids: []
  denied_app_ids: []
  trusted_publisher_domains: [microsoft.com, azure.com]
```

## 🎯 Risk Scoring

Risk scores are calculated based on:

| Factor | Impact |
|--------|--------|
| Permission category (tenant takeover, data exfiltration, etc.) | Base score |
| Application permissions vs delegated | 1.5x multiplier for app perms |
| User consent vs admin consent | +20% for user consent |
| No verified publisher | +30% |
| External/multi-tenant app | +20% |
| No owners (orphaned) | +30% |
| Inactive with high privileges | +40% |
| Expiring credentials | Additional flag |

### Risk Levels

| Level | Score Range |
|-------|-------------|
| Critical | ≥ 80 |
| High | 60-79 |
| Medium | 40-59 |
| Low | < 40 |

## 🔍 Permission Categories

Permissions are categorized by risk:

| Category | Description | Example Permissions |
|----------|-------------|---------------------|
| **Tenant Takeover** | Could lead to full tenant compromise | `Directory.ReadWrite.All`, `RoleManagement.ReadWrite.Directory` |
| **Privilege Escalation** | Could gain elevated access | `User.ReadWrite.All`, `Group.ReadWrite.All` |
| **Data Exfiltration** | Could extract sensitive data | `Mail.Read`, `Files.ReadWrite.All` |
| **Persistence** | Could maintain long-term access | `offline_access`, `Application.ReadWrite.All` |
| **Read-only** | Generally safe read access | `User.Read`, `Directory.Read.All` |

## 👻 Shadow OAuth Detection

OAuthKitchen detects these patterns:

| Pattern | Description | Severity |
|---------|-------------|----------|
| External Delegated High-Impact | Third-party apps with high-impact delegated permissions | High |
| User Consent High-Impact | User-consented apps with dangerous permissions | High |
| Offline Access Risk | Long-lived tokens with high-impact permissions | Medium |
| Inactive Privileged | Unused apps retaining high privileges | High |
| Orphaned Privileged | No owners but high-impact permissions | High |
| Unverified Publisher High-Impact | No verified publisher with dangerous permissions | High |

## 🛡️ Security Notes

1. **Store credentials securely** - Never commit secrets to source control
2. **Use certificate auth** - More secure than client secrets for automation
3. **Limit permissions** - Only grant the permissions you need
4. **Review reports carefully** - Tool provides analysis, human judgment required
5. **Test in non-production first** - Validate behavior before running in production

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding Permission Rules

Permission rules are in `src/oauthkitchen/rules/permissions.yaml`. To add a new permission:

```yaml
microsoft_graph:
  Your.Permission.Scope:
    display_name: "Human readable name"
    plain_english: "What this permission actually does"
    category: data_exfiltration  # or tenant_takeover, privilege_escalation, etc.
    impact_score: 70  # 0-100
    abuse_scenarios:
      - "How an attacker could misuse this"
      - "Another potential abuse"
    admin_impact_note: "Optional note about admin-equivalent impact"
```

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Built with:
- [MSAL Python](https://github.com/AzureAD/microsoft-authentication-library-for-python)
- [Typer](https://typer.tiangolo.com/)
- [Rich](https://rich.readthedocs.io/)
- [Jinja2](https://jinja.palletsprojects.com/)

## 📚 Related Resources

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/)
- [Entra ID Application Model](https://docs.microsoft.com/en-us/azure/active-directory/develop/app-objects-and-service-principals)
- [OAuth 2.0 Permission Scopes](https://docs.microsoft.com/en-us/graph/permissions-reference)