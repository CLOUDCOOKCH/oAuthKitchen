# CLAUDE.md — OAuthKitchen Codebase Guide

This file provides context for AI assistants working in this repository.

---

## Project Overview

**OAuthKitchen** is a browser-native SPA for Microsoft Entra ID OAuth security analysis. It connects directly to the Microsoft Graph API using MSAL.js — no backend, no server.

Three core capabilities:
1. **OAuth App Consent Analyzer** — Risk-scored analysis of all OAuth applications in a tenant
2. **Shadow OAuth Detector** — Identifies risky OAuth exposure patterns
3. **OAuth Permission Translator** — Converts raw permission scopes to plain English with abuse context

---

## Repository Structure

```
oAuthKitchen/
├── web/frontend/                  # The entire application
│   ├── public/
│   │   └── permissions.json       # Permission rules data (40+ Graph scopes)
│   ├── src/
│   │   ├── types/
│   │   │   └── models.ts          # All TypeScript domain types and enums
│   │   ├── lib/
│   │   │   ├── msalConfig.ts      # Builds MSAL config from user settings
│   │   │   ├── utils.ts           # cn, formatDate, getRiskColor helpers
│   │   │   ├── utils/
│   │   │   │   └── logger.ts      # Structured logger with in-memory store
│   │   │   ├── store/
│   │   │   │   ├── settingsStore.ts  # Persisted settings (clientId, tenantId)
│   │   │   │   ├── scanStore.ts      # Scan results and history
│   │   │   │   └── index.ts          # Barrel exports
│   │   │   ├── analyzers/
│   │   │   │   ├── translator.ts  # Permission → plain English (loads permissions.json)
│   │   │   │   ├── scoring.ts     # Risk score calculation (0-100)
│   │   │   │   └── shadow.ts      # Shadow OAuth pattern detection
│   │   │   └── api/
│   │   │       ├── graphClient.ts         # MSAL-backed Graph API client
│   │   │       └── collectors/
│   │   │           ├── applications.ts    # App registrations collector
│   │   │           ├── servicePrincipals.ts  # Service principals collector
│   │   │           └── orchestrator.ts   # Main scan entry point
│   │   ├── components/
│   │   │   ├── Layout.tsx         # Nav shell (MSAL user info + logout)
│   │   │   └── ui/                # Radix UI-based component library
│   │   ├── pages/
│   │   │   ├── Login.tsx          # MSAL popup login
│   │   │   ├── Dashboard.tsx      # Scan summary (charts + history)
│   │   │   ├── Scans.tsx          # Run scan + progress
│   │   │   ├── ScanDetail.tsx     # Full results (findings, apps, credentials)
│   │   │   ├── Permissions.tsx    # Permission translator browser
│   │   │   ├── Settings.tsx       # MSAL config form + thresholds
│   │   │   └── Tenants.tsx        # Redirects to /settings
│   │   ├── App.tsx                # Dynamic MSAL init + routing
│   │   └── main.tsx               # React entry point
│   ├── package.json
│   └── vite.config.ts
│
├── .github/workflows/ci.yml       # Frontend-only CI (lint, tsc, build)
├── README.md
└── CONTRIBUTING.md
```

---

## Development Setup

Node.js 20+ required.

```bash
cd web/frontend
npm install
npm run dev        # Dev server at http://localhost:5173
```

---

## Common Commands

```bash
cd web/frontend
npm run dev        # Dev server
npm run lint       # ESLint (zero warnings required)
npm run build      # TypeScript compile + Vite production build
npx tsc --noEmit   # Type check only
```

---

## CI/CD Pipeline

`.github/workflows/ci.yml` runs on push/PR to `main`:

| Job | What it does |
|-----|-------------|
| **lint** | `npm run lint` (ESLint zero warnings) |
| **type-check** | `npx tsc --noEmit` |
| **build** | `npm run build` (tsc + vite); uploads `dist/` artifact |

---

## Architecture & Key Conventions

### Authentication (MSAL.js)

- `@azure/msal-browser` and `@azure/msal-react` for browser-side OAuth
- `PublicClientApplication` is constructed dynamically in `App.tsx` from settings stored in Zustand
- `MsalProvider` wraps routes after MSAL is initialized
- Login uses popup flow (`loginPopup`) — no redirects
- Token acquisition: silent first, popup fallback (`acquireTokenSilent` → `acquireTokenPopup`)
- `useIsAuthenticated()` / `useMsal()` / `useAccount()` MSAL hooks used throughout pages

### Domain Model (`types/models.ts`)

Key enums:

| Enum | Values |
|------|--------|
| `RiskCategory` | `READ_ONLY`, `DATA_EXFILTRATION`, `PRIVILEGE_ESCALATION`, `TENANT_TAKEOVER`, `PERSISTENCE`, `LATERAL_MOVEMENT`, `UNKNOWN` |
| `PermissionType` | `DELEGATED`, `APPLICATION` |
| `ConsentType` | `ADMIN`, `USER`, `UNKNOWN` |
| `AppType` | `FIRST_PARTY_MICROSOFT`, `TENANT_OWNED`, `THIRD_PARTY_MULTI_TENANT`, `EXTERNAL_UNKNOWN` |
| `CredentialType` | `PASSWORD`, `CERTIFICATE` |

### Risk Scoring (`lib/analyzers/scoring.ts`)

Risk scores are 0–100. Thresholds:
- **Critical:** ≥ 80
- **High:** 60–79
- **Medium:** 40–59
- **Low:** < 40

Score multipliers (from `ScoringWeights`):
- Application permission: **1.5×**
- User consent: **1.2×**
- No verified publisher: **1.3×**
- No owner: **1.3×**
- Unused with high privileges: **1.4×**
- External / multi-tenant: **1.2×**

Keep weights configurable via `ScoringWeights`. Never hardcode values inside `RiskScorer`.

### Permission Translator (`lib/analyzers/translator.ts`)

Rules are loaded at runtime from `public/permissions.json` (fetched via `fetch('/permissions.json')`). Each rule:
- `scopeName` — the Graph permission scope
- `plainEnglish` — human-readable description
- `category` — maps to `RiskCategory`
- `impactScore` — integer 0–100
- `abuseScenarios` — list of strings

To add permissions: edit `public/permissions.json` directly.

### Shadow OAuth Detector (`lib/analyzers/shadow.ts`)

Detects 6 patterns, each yielding a `ShadowOAuthFinding`:
1. External delegated high-impact permissions
2. User-consented dangerous permissions
3. Offline access risk
4. Inactive privileged apps
5. Orphaned privileged apps
6. Unverified publisher with high-impact permissions

### Graph Client (`lib/api/graphClient.ts`)

`GraphClient` wraps all Microsoft Graph API calls:
- Constructed with `IPublicClientApplication` + `AccountInfo`
- `get<T>(path)` — single page GET
- `getAll<T>(path)` — fetches all pages automatically
- `detectCapabilities()` — probes for `AuditLog.Read.All` access

Always use `GraphClient` methods; never make raw `fetch` calls to Graph directly.

### Scan Orchestrator (`lib/api/collectors/orchestrator.ts`)

`runScan(msalInstance, account, tenantId, options, onProgress)` coordinates the full scan:
1. Detect capabilities (sign-in log availability)
2. Load permission rules
3. Collect app registrations
4. Collect service principals with grants/owners
5. Risk-score all service principals
6. Detect shadow OAuth findings
7. Identify expiring credentials
8. Compute aggregate statistics → return `AnalysisResult`

### State Management

- **`settingsStore`** — Zustand with `persist` middleware (localStorage). Holds `clientId`, `tenantId`, scope mode, thresholds.
- **`scanStore`** — Zustand. Holds `currentScan: AnalysisResult | null`, `scanHistory`, `isScanning`, `scanProgress`. History is persisted; full result is not (too large for localStorage).

### Frontend Conventions

- **State management:** Zustand (not Redux, not Context for global state)
- **HTTP client:** `GraphClient` (MSAL token-based, not Axios)
- **Routing:** React Router v6 (`createBrowserRouter`)
- **UI primitives:** Radix UI, wrapped in `src/components/ui/`
- **Styling:** Tailwind CSS; use `cn()` helper to compose classes
- **Icons:** Lucide React only
- **No inline styles**
- **TypeScript strict mode:** No `any`; explicit return types on exports

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/types/models.ts` | All domain enums and interfaces — read before changing data shapes |
| `src/lib/analyzers/scoring.ts` | Risk score calculation |
| `src/lib/analyzers/shadow.ts` | Shadow OAuth pattern definitions |
| `src/lib/analyzers/translator.ts` | Permission lookup + rule loading |
| `src/lib/api/collectors/orchestrator.ts` | Main scan entry point |
| `src/lib/store/settingsStore.ts` | All configurable parameters |
| `src/App.tsx` | Dynamic MSAL init + routing + ProtectedRoute |
| `public/permissions.json` | Permission metadata — add new scopes here |
| `.github/workflows/ci.yml` | CI pipeline — all jobs must pass before merging |

---

## Security Conventions

- **Read-only by design.** The app never modifies tenant configuration.
- **No secrets committed.** `clientId`/`tenantId` live in localStorage via Zustand persist.
- **No backend.** All data flows browser → MSAL → Microsoft Graph.
- **Delegated permissions only.** The app acts on behalf of the signed-in user; admin consent is required once per tenant.
