# Frontend-Only SPA Restructuring Roadmap

## Project Status: IN PROGRESS

This document tracks the comprehensive restructuring of OAuthKitchen from a multi-layered architecture (Python CLI + FastAPI backend + React frontend) to a **frontend-only SPA** that runs entirely in the browser.

---

## ✅ Completed

### Foundation
- ✅ Created directory structure (`src/lib/`, `src/types/`, `tests/`)
- ✅ Ported core data models (`src/types/models.ts`) - 340 lines
  - All enums (CredentialType, ConsentType, PermissionType, RiskCategory, AppType)
  - All interfaces (Credential, Owner, Application, ServicePrincipal, etc.)
  - 20+ helper functions for computed properties
- ✅ Ported configuration system (`src/lib/utils/config.ts`) - 320 lines
  - Default config constants
  - JSON loading with camelCase/snake_case support
  - Environment variable support
  - Config serialization
- ✅ Ported logging utility (`src/lib/utils/logger.ts`) - 110 lines
  - Structured logging with levels
  - In-memory log storage
  - Console output integration
- ✅ Ported cache utility (`src/lib/utils/cache.ts`) - 130 lines
  - TTL-based cache with auto-expiration
  - Memory management and pruning

**Total TypeScript lines ported: ~900**

---

## 🔄 In Progress

### Analyzers (2,300+ lines to port)

#### Phase 1: Permission Translator
- [ ] Port `src/oauthkitchen/analyzers/translator.py` → `src/lib/analyzers/translator.ts`
  - Convert YAML rule loading to JSON fetch
  - Implement `TranslatedPermission` interface
  - Port permission lookup and enrichment logic
  - **Estimated: 200-250 lines**

#### Phase 2: Risk Scorer
- [ ] Port `src/oauthkitchen/analyzers/scoring.py` → `src/lib/analyzers/scoring.ts`
  - Complex algorithm with multiple scoring factors
  - Permission vs application weighting
  - Credential and activity analysis
  - **Estimated: 450-500 lines**

#### Phase 3: Shadow OAuth Detector
- [ ] Port `src/oauthkitchen/analyzers/shadow.py` → `src/lib/analyzers/shadow.ts`
  - Six detection patterns for risky OAuth exposure
  - Finding generation with recommendations
  - **Estimated: 300-350 lines**

---

## 📋 Remaining Work

### API Layer (600+ lines)
1. **GraphClient** (`src/lib/api/graphClient.ts`)
   - Microsoft Graph API interaction
   - Token-based authentication
   - Application, ServicePrincipal, Permission Grants endpoints
   - **Estimated: 400 lines**

2. **ScanOrchestrator** (`src/lib/api/scanOrchestrator.ts`)
   - Coordinates all collectors
   - Progress tracking
   - Error handling
   - **Estimated: 250 lines**

### MSAL Integration (200+ lines)
- [ ] Create auth store (`src/lib/store/auth.ts`)
- [ ] MSAL context setup for React
- [ ] Token refresh logic
- [ ] User info management

### Frontend Integration (300+ lines)
- [ ] Update pages to use new TypeScript analyzers
- [ ] Wire up GraphClient in components
- [ ] Create scanner UI component
- [ ] Connect progress tracking to UI

### Testing Suite (1,000+ lines)
- [ ] Unit tests for models
- [ ] Analyzer algorithm tests
- [ ] Vitest configuration
- [ ] Mock fixtures

### CI/CD & Cleanup (50+ lines)
- [ ] Update `.github/workflows/ci.yml`
  - Remove Python jobs
  - Add Node.js test matrix
  - TypeScript type checking
  - Coverage reporting
- [ ] Update `package.json` scripts
- [ ] Delete Python backend (`/web/backend/`)
- [ ] Delete Python CLI (`/src/oauthkitchen/`)
- [ ] Remove Python test suite (`/tests/`)
- [ ] Delete `pyproject.toml` and `oauthkitchen.sample.yaml`

### Documentation (500+ lines)
- [ ] Update `README.md` - SPA setup instructions
- [ ] Update `CONTRIBUTING.md` - TypeScript guidelines
- [ ] Update `CLAUDE.md` - new architecture
- [ ] Create `rules/permissions.json` from YAML

---

## 🎯 Key Milestones

| Milestone | Target | Status |
|-----------|--------|--------|
| **Foundation** | Models, config, utils | ✅ Complete |
| **Analyzers** | All three analysis engines | 🔄 In Progress |
| **API Layer** | Graph client and orchestrator | ⏳ Pending |
| **MSAL Auth** | Browser-based OAuth 2.0 | ⏳ Pending |
| **Frontend** | Component integration | ⏳ Pending |
| **Testing** | 80%+ coverage | ⏳ Pending |
| **Cleanup** | Remove Python code | ⏳ Pending |
| **Docs** | Final documentation | ⏳ Pending |

---

## 📊 Estimated Effort

| Task | Lines | Complexity | Duration |
|------|-------|-----------|----------|
| Analyzer porting | 1,000+ | High | 2-3 hours |
| API layer porting | 600+ | High | 2 hours |
| MSAL integration | 200+ | Medium | 1 hour |
| Frontend wiring | 300+ | Medium | 1-2 hours |
| Test suite | 1,000+ | High | 3-4 hours |
| CI/CD updates | 50+ | Low | 30 min |
| Documentation | 500+ | Low | 1-2 hours |
| **TOTAL** | **3,650+** | **High** | **11-15 hours** |

---

## 🔑 Key Architecture Decisions

1. **No Backend** - All analysis runs in browser using MSAL tokens
2. **Direct Graph API** - Frontend calls Microsoft Graph directly (CORS enabled)
3. **TypeScript Models** - All Python dataclasses converted to TypeScript interfaces
4. **JSON Rules** - Permission rules as JSON (not YAML) for browser loading
5. **Zustand State** - Existing state management + new analyzer stores
6. **Web Workers** (optional) - For heavy computation without blocking UI

---

## 🚀 Next Steps

### Immediate (Next Phase)
1. **Port Permission Translator** - Core enrichment logic
2. **Port Risk Scorer** - Most complex algorithm
3. **Port Shadow Detector** - Pattern detection
4. **Create permission rules JSON** - Convert YAML to JSON

### Short-term
5. **Port GraphClient** - API interaction layer
6. **Port ScanOrchestrator** - Orchestration logic
7. **MSAL Integration** - Browser-based auth

### Medium-term
8. **Frontend Integration** - Wire up analyzers in pages
9. **Create Test Suite** - Unit + integration tests
10. **CI/CD Pipeline** - Node.js based testing

### Long-term
11. **Documentation** - Update all docs
12. **Cleanup** - Remove Python code
13. **Final Testing** - E2E with real Graph API
14. **Deployment** - Static SPA hosting

---

## 📝 Notes

- **Rules Migration**: Convert `src/oauthkitchen/rules/permissions.yaml` to `public/permissions.json`
- **Config Format**: Support both camelCase (TypeScript) and snake_case (legacy) in JSON
- **Browser Limits**: May need pagination for large tenants (1000+ apps)
- **CORS**: Requires MSAL public SPA registration in Azure
- **Offline**: Consider IndexedDB caching for offline mode
- **Performance**: Risk scoring should complete <500ms for typical tenant

---

## ⚠️ Blockers

- [ ] Need `public/permissions.json` rules file migration
- [ ] MSAL config needs tenant/client ID (setup in Azure)
- [ ] Graph API permissions in app registration

---

## 🔗 Related Files

- Original plan: See parallel agent output from restructuring plan agent
- Current branch: `claude/claude-md-mlrprc9nvjwxw2yz-YBzmw`
- Frontend code: `web/frontend/src/`
- Tests will go in: `tests/unit/` and `tests/fixtures/`
