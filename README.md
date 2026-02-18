# OAuthKitchen

**OAuth Security Analysis Tool for Microsoft Entra ID — browser-native SPA**

OAuthKitchen is a frontend-only single-page application that connects directly to Microsoft Graph API via MSAL.js. No backend, no server — just open the app, sign in with your Azure AD account, and run a security scan against your tenant.

## Features

- **Risk-scored analysis** of all OAuth app registrations and service principals
- **Shadow OAuth detection** — external apps, user-consented dangerous permissions, orphaned apps, inactive privileged apps, unverified publishers
- **Permission translator** — 40+ Microsoft Graph scopes with plain-English descriptions and abuse scenarios
- **Credential expiry tracking** with configurable warning thresholds
- **Activity analysis** when `AuditLog.Read.All` is available

## Quick Start

### Prerequisites

- Node.js 20+
- An Azure AD App Registration with the required API permissions (see below)

### Run locally

```bash
cd web/frontend
npm install
npm run dev        # http://localhost:5173
```

### First-time setup

1. Open the app and go to **Settings**
2. Enter your **Client ID** and **Tenant ID**
3. Sign in — MSAL handles the OAuth popup flow
4. Go to **Scans** and click **Run Scan**

## Required App Registration Permissions

Create an App Registration in [Azure Portal](https://portal.azure.com) → Entra ID → App registrations.

| Permission | Type | Purpose |
|------------|------|---------|
| `Application.Read.All` | Delegated | Read all app registrations |
| `Directory.Read.All` | Delegated | Read directory objects |
| `AuditLog.Read.All` | Delegated | Sign-in activity (optional) |

> All permissions are **delegated** — the app acts on behalf of the signed-in user. Grant admin consent so users don't need to consent individually.

Under **Authentication**, add a Single-page application redirect URI pointing to `http://localhost:5173` (or your deployed URL).

## Risk Scoring

Scores are 0–100 with these thresholds:

| Level | Score |
|-------|-------|
| Critical | ≥ 80 |
| High | 60–79 |
| Medium | 40–59 |
| Low | < 40 |

Factors that raise scores: application permissions (1.5×), user consent (1.2×), no verified publisher (1.3×), no owners (1.3×), inactive with high privileges (1.4×), external/multi-tenant (1.2×).

## Shadow OAuth Patterns Detected

| Pattern | Severity |
|---------|----------|
| External app with high-impact delegated permissions | High |
| User-consented dangerous permissions | High |
| Offline access with high-impact permissions | Medium |
| Inactive app retaining high privileges | High |
| Orphaned app (no owners) with high privileges | High |
| Unverified publisher with dangerous permissions | High |

## Permission Categories

| Category | Examples |
|----------|---------|
| Tenant Takeover | `Directory.ReadWrite.All`, `RoleManagement.ReadWrite.Directory` |
| Privilege Escalation | `User.ReadWrite.All`, `Group.ReadWrite.All` |
| Data Exfiltration | `Mail.Read`, `Files.ReadWrite.All` |
| Persistence | `offline_access`, `Application.ReadWrite.All` |
| Read-only | `User.Read`, `Directory.Read.All` |

## Development

```bash
cd web/frontend
npm run dev        # Dev server
npm run lint       # ESLint
npm run build      # Production build (TypeScript + Vite)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Adding Permission Rules

Permission metadata lives in `web/frontend/public/permissions.json`. Add a new entry:

```json
{
  "scopeName": "Your.Permission.Scope",
  "plainEnglish": "What this permission allows in plain English",
  "category": "data_exfiltration",
  "impactScore": 70,
  "abuseScenarios": [
    "How an attacker could misuse this",
    "Another abuse scenario"
  ],
  "adminImpactNote": "Optional note about admin-equivalent impact"
}
```

Categories: `read_only`, `data_exfiltration`, `privilege_escalation`, `tenant_takeover`, `persistence`, `lateral_movement`.

## Security Notes

- The app never modifies tenant configuration — read-only by design
- Credentials (clientId, tenantId) are stored in `localStorage` via Zustand persist — no server-side storage
- MSAL handles token acquisition, refresh, and secure storage
- Never commit secrets; the app registration uses delegated (user-context) permissions only

## Built With

- [MSAL.js](https://github.com/AzureAD/microsoft-authentication-library-for-javascript) — Azure AD authentication
- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- [Zustand](https://github.com/pmndrs/zustand) — state management
- [TanStack Query](https://tanstack.com/query) — data fetching
- [Radix UI](https://www.radix-ui.com/) + [Tailwind CSS](https://tailwindcss.com/) — UI
- [Recharts](https://recharts.org/) — charts
- [Framer Motion](https://www.framer.com/motion/) — animations

## License

MIT — see [LICENSE](LICENSE) for details.
