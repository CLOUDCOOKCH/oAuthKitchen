# CLAUDE.md — OAuthKitchen Codebase Guide

This file provides context for AI assistants working in this repository.

---

## Project Overview

**OAuthKitchen** is a security analysis tool for Microsoft Entra ID (Azure AD) OAuth applications. It combines three core capabilities:

1. **OAuth App Consent Analyzer** — Risk-scored analysis of all OAuth applications in a tenant
2. **Shadow OAuth Detector** — Identifies risky OAuth exposure patterns (orphaned apps, user-consented dangerous permissions, etc.)
3. **OAuth Permission Translator** — Converts raw permission scopes to plain English with abuse context

The project consists of two parts:
- A **Python CLI tool** (`src/oauthkitchen/`) — the core analysis engine
- A **Web application** (`web/`) — a React/FastAPI wrapper for ongoing monitoring

---

## Repository Structure

```
oAuthKitchen/
├── src/oauthkitchen/          # Core Python CLI package
│   ├── __init__.py            # Version: 0.1.0
│   ├── cli.py                 # CLI entry point (Typer commands)
│   ├── config.py              # Configuration dataclasses
│   ├── graph_client.py        # Microsoft Graph API client
│   ├── models.py              # Core domain models and enums
│   ├── collectors/            # Data gathering from Graph API
│   │   ├── base.py
│   │   ├── orchestrator.py    # Coordinates all collectors
│   │   ├── applications.py
│   │   ├── service_principals.py
│   │   └── permissions.py
│   ├── analyzers/             # Analysis engines
│   │   ├── translator.py      # Permission → plain English
│   │   ├── scoring.py         # Risk score calculation
│   │   └── shadow.py          # Shadow OAuth pattern detection
│   ├── reporters/             # Output generators
│   │   ├── base.py
│   │   ├── html.py
│   │   ├── markdown.py
│   │   ├── csv_export.py
│   │   └── json_export.py
│   ├── templates/             # Jinja2 templates
│   │   ├── report.html
│   │   └── summary.md
│   └── utils/
│       ├── logging.py         # Rich console logging
│       └── cache.py           # Graph API response cache
│
├── tests/                     # Pytest test suite
│   ├── conftest.py            # Fixtures and sample data factories
│   ├── test_models.py
│   ├── test_scoring.py
│   ├── test_translator.py
│   └── test_shadow.py
│
├── web/
│   ├── frontend/              # React 18 + TypeScript + Vite
│   │   └── src/
│   │       ├── components/    # Radix UI-based component library
│   │       └── pages/         # 7 page components
│   └── backend/               # FastAPI + SQLAlchemy
│       └── app/
│           ├── main.py
│           ├── routers/       # Auth, tenants, scans, dashboard, permissions
│           └── services/
│               └── scanner.py # Background scan execution
│
├── pyproject.toml             # Python project config (build, deps, tools)
├── oauthkitchen.sample.yaml   # Full configuration reference
├── README.md
└── CONTRIBUTING.md
```

---

## Development Setup

### Python CLI

Requires Python 3.11 or 3.12.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -e ".[dev]"         # Installs package + dev dependencies
```

### Web Frontend

```bash
cd web/frontend
npm install
npm run dev                     # Dev server at http://localhost:5173
```

The frontend proxies API requests to `http://localhost:8000`.

### Web Backend

```bash
cd web/backend
pip install -r requirements.txt
uvicorn app.main:app --reload   # API at http://localhost:8000
```

---

## Common Commands

### Testing

```bash
pytest tests/ -v                          # Run all tests with verbose output
pytest tests/test_scoring.py -v           # Run a single test file
pytest --cov=oauthkitchen --cov-report=term-missing  # With coverage
```

Coverage configuration is in `pyproject.toml` under `[tool.pytest.ini_options]`.

### Linting & Formatting

```bash
ruff check src/ tests/          # Lint
ruff check src/ tests/ --fix    # Lint and auto-fix
ruff format src/ tests/         # Format (replaces black + isort)
```

### Type Checking

```bash
mypy src/oauthkitchen           # Type check (informational, not blocking)
```

### Frontend

```bash
cd web/frontend
npm run lint                    # ESLint (zero warnings allowed)
npm run build                   # TypeScript compile + Vite production build
npm run preview                 # Preview production build
```

### CLI Usage

```bash
oauthkitchen scan --tenant <id> --client-id <id> --client-secret <secret>
oauthkitchen translate --permission "Mail.ReadWrite"
oauthkitchen explain --app-id <id>
oauthkitchen baseline           # Generate sample config file
```

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push/PR to `main`:

| Job | What it does |
|-----|-------------|
| **lint** | `ruff check` + `ruff format --check` on Python 3.11 |
| **test** | Pytest matrix: Ubuntu/Windows/macOS × Python 3.11/3.12; uploads coverage to Codecov |
| **type-check** | `mypy` (informational only, non-blocking) |
| **build** | Python package build verification |

All jobs must pass before merging to `main`.

---

## Architecture & Key Conventions

### Python Conventions

- **Python version:** 3.11+ (use modern syntax: `X | Y` unions, `match` statements, `tomllib`, etc.)
- **Line length:** 100 characters (configured in `ruff`)
- **Formatter/linter:** Ruff (not black, not flake8). Run `ruff format` before committing.
- **Type hints:** Required on all public functions. MyPy strict mode is enforced.
- **Dataclasses:** Core models use `@dataclass` or Pydantic `BaseModel` (CLI models use dataclasses; API schemas use Pydantic).
- **Imports:** Ruff enforces `isort`-compatible ordering (rule `I`). First-party = `oauthkitchen`.
- **Security rules:** Ruff rule `S` (bandit) is active. Avoid `S101` in test files (already ignored), but fix security warnings in source.
- **No `assert` in source code:** Use explicit `if/raise` for runtime guards.

### Domain Model (`models.py`)

Key enums to understand before touching any analysis logic:

| Enum | Values |
|------|--------|
| `RiskCategory` | `READ_ONLY`, `DATA_EXFILTRATION`, `PRIVILEGE_ESCALATION`, `TENANT_TAKEOVER`, `PERSISTENCE`, `LATERAL_MOVEMENT`, `UNKNOWN` |
| `PermissionType` | `DELEGATED`, `APPLICATION` |
| `ConsentType` | `ADMIN`, `USER`, `UNKNOWN` |
| `AppType` | `FIRST_PARTY_MICROSOFT`, `TENANT_OWNED`, `THIRD_PARTY_MULTI_TENANT`, `EXTERNAL_UNKNOWN` |
| `CredentialType` | `PASSWORD`, `CERTIFICATE` |

### Risk Scoring (`analyzers/scoring.py`)

Risk scores are 0–100. Thresholds:
- **Critical:** ≥ 80
- **High:** 60–79
- **Medium:** 40–59
- **Low:** < 40

Score multipliers (from `config.py` `ScoringWeights`):
- Application (non-delegated) permission: **1.5×**
- User consent (not admin): **1.2×**
- No verified publisher: **1.3×**
- No owner (orphaned): **1.3×**
- Unused app with high privileges: **1.4×**
- External / multi-tenant app: **1.2×**

When modifying the scorer, keep multipliers configurable via `ScoringWeights`. Never hardcode weights inside `RiskScorer`.

### Permission Translator (`analyzers/translator.py`)

Permission rules are loaded from a YAML file at `src/oauthkitchen/rules/permissions.yaml`. Each rule maps a permission scope name to:
- `description` — plain English
- `risk_category` — one of the `RiskCategory` enum values
- `impact_score` — integer 0–100
- `abuse_scenarios` — list of strings

When adding new permission rules, edit the YAML file directly. Do not hardcode permission metadata in Python.

### Shadow OAuth Detector (`analyzers/shadow.py`)

Detects these patterns (each yields a `ShadowOAuthFinding`):
1. External delegated high-impact permissions
2. User-consented dangerous permissions
3. Offline access risk (long-lived tokens)
4. Inactive privileged apps
5. Orphaned privileged apps
6. Unverified publisher with high-impact permissions

Each finding includes optional remediation suggestions (disabled by default, controlled by config).

### Configuration (`config.py`)

All configuration is expressed as dataclasses. The primary config file format is YAML (see `oauthkitchen.sample.yaml`). Environment variables override file values. Key classes:

- `AuthConfig` — tenant/client credentials and auth method
- `ScoringWeights` — multipliers for risk factors (all configurable)
- `ThresholdConfig` — credential expiry windows (critical/high/medium/low days)
- `OutputConfig` — output directory and enabled formats
- `AllowDenyConfig` — safe app allow-lists, deny-lists, trusted publishers

### Reporters (`reporters/`)

All reporters inherit from `BaseReporter`. Adding a new output format:
1. Create a new file in `reporters/`
2. Subclass `BaseReporter`
3. Implement the `generate(result: AnalysisResult) -> str` method
4. Register the format in `cli.py`

### Graph Client (`graph_client.py`)

The `GraphClient` handles all Microsoft Graph API calls. Authentication supports three methods, chosen at runtime from config:
- `client_secret` — `password_credential_auth()`
- `certificate` — `certificate_auth()`
- `device_code` — `device_code_auth()` (interactive, for dev/testing)

API responses are cached via `utils/cache.py` (default TTL: 3600s). Always use `GraphClient` methods rather than making raw HTTP calls.

---

## Web Application Conventions

### Frontend (React + TypeScript)

- **State management:** Zustand stores (not Redux, not Context for global state)
- **Data fetching:** TanStack React Query v5 (`useQuery`, `useMutation`)
- **HTTP client:** Axios (configured instance in `src/api/`)
- **Routing:** React Router v6 (`createBrowserRouter`)
- **UI primitives:** Radix UI components, wrapped in `src/components/ui/`
- **Styling:** Tailwind CSS utility classes; use `tailwind-merge` (`cn()` helper) to compose classes
- **Icons:** Lucide React only
- **No inline styles:** All styling must use Tailwind classes
- **TypeScript strict mode:** No `any` types; explicit return types on exported functions

### Backend (FastAPI)

- **Database:** SQLAlchemy 2.0 async with Alembic migrations
- **Schemas:** Pydantic v2 models in `app/schemas.py` (request/response validation)
- **Auth:** JWT tokens (access + refresh) via `app/auth.py`
- **Background tasks:** Celery + Redis for long-running scans
- **CORS:** Enabled for the frontend origin only
- **API versioning:** All routes prefixed with `/api/`

---

## Testing Conventions

- All tests live in `tests/` with the prefix `test_`.
- Fixtures are defined in `conftest.py`. Use them; do not create one-off setup in test functions.
- Tests use `pytest-mock` (`mocker` fixture) — do not use `unittest.mock` directly.
- Tests must not make real network calls. Mock `GraphClient` at the boundary.
- Coverage target: 80%+ on core analyzers (`scoring.py`, `shadow.py`, `translator.py`).
- Add tests for every new analyzer feature or bug fix before the implementation is considered done.

---

## Security Conventions

- **Never commit credentials.** The `.gitignore` excludes `.env`, `*.yaml` (except the sample), and `*.pem`.
- **Reporting-only by default.** The tool never modifies tenant configuration unless explicitly enabled.
- **Remediation suggestions off by default.** Controlled by `output.include_remediation` in config.
- **Sensitive config via environment variables**, not committed files, for CI/CD usage.
- Follow OWASP top 10 mitigations in the web backend: parameterized queries, JWT expiry, password hashing with bcrypt.

---

## Dependency Management

### Python

Dependencies are declared in `pyproject.toml`:
- `[project.dependencies]` — runtime
- `[project.optional-dependencies] dev` — dev/test only

To add a dependency:
```bash
# Edit pyproject.toml, then:
pip install -e ".[dev]"
```

Do not use `requirements.txt` for the CLI package (only the web backend uses one).

### Frontend

```bash
cd web/frontend
npm install <package>           # Runtime dep
npm install -D <package>        # Dev dep
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `src/oauthkitchen/cli.py` | All CLI commands and output format dispatch |
| `src/oauthkitchen/models.py` | All domain enums and dataclasses — read before changing data shapes |
| `src/oauthkitchen/analyzers/scoring.py` | Risk score calculation logic |
| `src/oauthkitchen/analyzers/shadow.py` | Shadow OAuth pattern definitions |
| `src/oauthkitchen/config.py` | All configurable parameters and defaults |
| `src/oauthkitchen/rules/permissions.yaml` | Permission metadata (add new permissions here) |
| `oauthkitchen.sample.yaml` | Full configuration reference — keep in sync with `config.py` |
| `tests/conftest.py` | Shared test fixtures — extend here, not in individual test files |
| `pyproject.toml` | Build config, dependencies, ruff/mypy/pytest settings |
| `.github/workflows/ci.yml` | CI pipeline — all jobs must pass before merging |
