# Contributing to OAuthKitchen

Thank you for your interest in contributing to OAuthKitchen! This document provides guidelines for contributing to the project.

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all backgrounds and experience levels.

## How to Contribute

### Reporting Issues

1. Check if the issue already exists
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce (if bug)
   - Expected vs actual behavior
   - Environment details (OS, Python version)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`pytest tests/`)
5. Run linting (`ruff check src/ tests/`)
6. Commit with clear messages
7. Push and create a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/oauthkitchen.git
cd oauthkitchen

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run linting
ruff check src/ tests/
ruff format src/ tests/
```

## Areas to Contribute

### Permission Rules

The permission translator rules file (`src/oauthkitchen/rules/permissions.yaml`) is a great place to contribute:

1. Add new Microsoft Graph permissions
2. Improve descriptions and abuse scenarios
3. Add permissions for other APIs (SharePoint, Exchange, etc.)

Format for new permissions:

```yaml
microsoft_graph:
  Permission.Scope.Name:
    display_name: "Human-readable name"
    plain_english: "Clear description of what this permission allows"
    category: data_exfiltration  # See categories below
    impact_score: 70  # 0-100, be conservative
    abuse_scenarios:
      - "Specific way this could be abused"
      - "Another abuse scenario"
    admin_impact_note: "Optional: equivalent admin impact"
```

Categories:
- `read_only` - Generally safe read access
- `data_exfiltration` - Could extract sensitive data
- `privilege_escalation` - Could gain elevated access
- `tenant_takeover` - Could lead to full tenant compromise
- `persistence` - Could maintain long-term access
- `lateral_movement` - Could access other resources/users

### Code Contributions

Areas that could use improvement:
- Additional output formats
- Performance optimizations
- Better error handling
- Documentation improvements
- Additional detection rules

### Testing

- Add tests for new features
- Improve test coverage
- Add integration tests (mocked Graph API)

## Code Style

- Follow PEP 8
- Use type hints
- Write docstrings for public functions
- Keep functions focused and small
- Add comments for complex logic

## Commit Messages

Use clear, descriptive commit messages:

```
feat: Add support for SharePoint permissions
fix: Handle empty permission grants correctly
docs: Update README with new CLI options
test: Add tests for scoring engine
refactor: Simplify permission translation logic
```

## Questions?

Open an issue with the "question" label if you need help or clarification.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.