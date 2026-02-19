# Contributing to OAuthKitchen

Thank you for contributing! This document covers how to get set up and where to make changes.

## Code of Conduct

Be respectful and constructive. All contributors are welcome regardless of background or experience level.

## Development Setup

```bash
git clone https://github.com/oauthkitchen/oauthkitchen.git
cd oauthkitchen/web/frontend
npm install
npm run dev        # http://localhost:5173
```

## Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run lint and build checks:
   ```bash
   npm run lint
   npm run build
   npx tsc --noEmit
   ```
5. Commit with clear messages
6. Push and open a Pull Request

## Project Structure

```
web/frontend/src/
├── lib/
│   ├── analyzers/       # Risk scorer, shadow detector, permission translator
│   ├── api/             # Graph API client and data collectors
│   │   └── collectors/  # App registrations, service principals, scan orchestrator
│   ├── store/           # Zustand state stores (settings, scan results)
│   ├── msalConfig.ts    # MSAL configuration builder
│   └── utils.ts         # Shared helpers (cn, formatDate, getRiskColor)
├── types/
│   └── models.ts        # All TypeScript domain types and interfaces
├── pages/               # Route-level page components
├── components/          # Shared UI components
└── public/
    └── permissions.json # Permission rules data (add new scopes here)
```

## Areas to Contribute

### Adding Permission Rules

Edit `web/frontend/public/permissions.json`. Add an object to the array:

```json
{
  "scopeName": "Permission.Scope.Name",
  "plainEnglish": "Clear description of what this permission allows",
  "category": "data_exfiltration",
  "impactScore": 70,
  "abuseScenarios": [
    "How an attacker could misuse this",
    "Another abuse scenario"
  ],
  "adminImpactNote": "Optional: equivalent admin impact"
}
```

Categories: `read_only` · `data_exfiltration` · `privilege_escalation` · `tenant_takeover` · `persistence` · `lateral_movement`

### Improving Analyzers

- **Risk scorer** — `src/lib/analyzers/scoring.ts`: adjust factor weights or add new scoring factors
- **Shadow detector** — `src/lib/analyzers/shadow.ts`: add new detection patterns, each producing a `ShadowOAuthFinding`
- **Translator** — `src/lib/analyzers/translator.ts`: update rule loading or lookup logic

### UI / Pages

- **Stack**: React 18 + TypeScript, Radix UI, Tailwind CSS, Lucide React icons
- Use the `cn()` helper from `src/lib/utils.ts` to compose Tailwind classes
- No inline styles — Tailwind classes only
- No `any` types; explicit return types on exported functions

### Graph API Collectors

Add new data collection in `src/lib/api/collectors/`. Each collector receives a `GraphClient` instance and returns normalized domain types from `src/types/models.ts`.

## Code Style

- TypeScript strict mode — no `any`, explicit return types on exports
- ESLint enforced — zero warnings (`npm run lint`)
- Tailwind for all styling
- Lucide React for icons only

## Commit Messages

```
feat: add SharePoint permission rules
fix: handle empty permission grants in scorer
docs: update contributing guide
refactor: simplify shadow detection logic
```

## Questions?

Open an issue with the "question" label.

## License

By contributing, you agree your contributions will be licensed under the MIT License.
