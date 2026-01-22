"""
Configuration management for OAuthKitchen.

Supports loading configuration from YAML/JSON files and environment variables.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class AuthConfig:
    """Authentication configuration."""
    tenant_id: str = ""
    client_id: str = ""
    client_secret: str | None = None  # For client credentials flow
    certificate_path: str | None = None  # For certificate auth
    certificate_password: str | None = None
    use_device_code: bool = False  # For interactive device code flow


@dataclass
class ThresholdConfig:
    """Threshold configuration for analysis."""
    # Credential expiry thresholds (days)
    credential_expiry_critical: int = 7
    credential_expiry_high: int = 30
    credential_expiry_medium: int = 60
    credential_expiry_low: int = 90

    # Inactivity threshold (days) - used when sign-in data available
    inactive_days_threshold: int = 90

    # Credential age concern threshold (days)
    credential_age_concern: int = 365


@dataclass
class ScoringWeights:
    """Weights for risk scoring calculation."""
    # Permission type multipliers
    application_permission_multiplier: float = 1.5
    delegated_permission_multiplier: float = 1.0

    # Consent type weights
    user_consent_weight: float = 1.2
    admin_consent_weight: float = 1.0

    # Publisher/trust weights
    no_verified_publisher_weight: float = 1.3
    external_multi_tenant_weight: float = 1.2
    first_party_microsoft_weight: float = 0.3  # Reduced risk for MS apps

    # Ownership weights
    no_owner_weight: float = 1.3

    # Activity weights
    unused_high_privilege_weight: float = 1.4

    # Permission category base scores (0-100)
    score_tenant_takeover: int = 100
    score_privilege_escalation: int = 85
    score_data_exfiltration: int = 70
    score_persistence: int = 60
    score_lateral_movement: int = 50
    score_read_only: int = 20
    score_unknown: int = 30


@dataclass
class OutputConfig:
    """Output configuration."""
    output_directory: str = "./oauthkitchen-output"
    formats: list[str] = field(default_factory=lambda: ["html", "md", "csv"])
    include_json: bool = True
    include_remediation_suggestions: bool = False  # Off by default (safe)


@dataclass
class AllowDenyConfig:
    """Allow/deny lists for known apps."""
    # App IDs to exclude from risk scoring (known safe)
    allowed_app_ids: list[str] = field(default_factory=list)

    # App IDs to always flag (known risky)
    denied_app_ids: list[str] = field(default_factory=list)

    # Publisher domains to trust
    trusted_publisher_domains: list[str] = field(default_factory=list)


@dataclass
class Config:
    """Main configuration class."""
    auth: AuthConfig = field(default_factory=AuthConfig)
    thresholds: ThresholdConfig = field(default_factory=ThresholdConfig)
    scoring: ScoringWeights = field(default_factory=ScoringWeights)
    output: OutputConfig = field(default_factory=OutputConfig)
    allow_deny: AllowDenyConfig = field(default_factory=AllowDenyConfig)

    # Analysis mode
    mode: str = "auto"  # "auto", "full", "limited"

    # Caching
    enable_cache: bool = True
    cache_ttl_seconds: int = 3600

    # Logging
    log_level: str = "INFO"
    verbose: bool = False

    @classmethod
    def from_file(cls, path: str | Path) -> "Config":
        """Load configuration from a YAML or JSON file."""
        path = Path(path)

        if not path.exists():
            raise FileNotFoundError(f"Configuration file not found: {path}")

        with open(path, "r", encoding="utf-8") as f:
            if path.suffix in (".yaml", ".yml"):
                data = yaml.safe_load(f) or {}
            elif path.suffix == ".json":
                data = json.load(f)
            else:
                raise ValueError(f"Unsupported config file format: {path.suffix}")

        return cls.from_dict(data)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Config":
        """Create config from a dictionary."""
        config = cls()

        # Auth config
        if "auth" in data:
            auth_data = data["auth"]
            config.auth = AuthConfig(
                tenant_id=auth_data.get("tenant_id", ""),
                client_id=auth_data.get("client_id", ""),
                client_secret=auth_data.get("client_secret"),
                certificate_path=auth_data.get("certificate_path"),
                certificate_password=auth_data.get("certificate_password"),
                use_device_code=auth_data.get("use_device_code", False),
            )

        # Thresholds
        if "thresholds" in data:
            th = data["thresholds"]
            config.thresholds = ThresholdConfig(
                credential_expiry_critical=th.get("credential_expiry_critical", 7),
                credential_expiry_high=th.get("credential_expiry_high", 30),
                credential_expiry_medium=th.get("credential_expiry_medium", 60),
                credential_expiry_low=th.get("credential_expiry_low", 90),
                inactive_days_threshold=th.get("inactive_days_threshold", 90),
                credential_age_concern=th.get("credential_age_concern", 365),
            )

        # Scoring weights
        if "scoring" in data:
            sc = data["scoring"]
            config.scoring = ScoringWeights(
                application_permission_multiplier=sc.get(
                    "application_permission_multiplier", 1.5
                ),
                delegated_permission_multiplier=sc.get(
                    "delegated_permission_multiplier", 1.0
                ),
                user_consent_weight=sc.get("user_consent_weight", 1.2),
                admin_consent_weight=sc.get("admin_consent_weight", 1.0),
                no_verified_publisher_weight=sc.get("no_verified_publisher_weight", 1.3),
                external_multi_tenant_weight=sc.get("external_multi_tenant_weight", 1.2),
                first_party_microsoft_weight=sc.get("first_party_microsoft_weight", 0.3),
                no_owner_weight=sc.get("no_owner_weight", 1.3),
                unused_high_privilege_weight=sc.get("unused_high_privilege_weight", 1.4),
                score_tenant_takeover=sc.get("score_tenant_takeover", 100),
                score_privilege_escalation=sc.get("score_privilege_escalation", 85),
                score_data_exfiltration=sc.get("score_data_exfiltration", 70),
                score_persistence=sc.get("score_persistence", 60),
                score_lateral_movement=sc.get("score_lateral_movement", 50),
                score_read_only=sc.get("score_read_only", 20),
                score_unknown=sc.get("score_unknown", 30),
            )

        # Output config
        if "output" in data:
            out = data["output"]
            config.output = OutputConfig(
                output_directory=out.get("output_directory", "./oauthkitchen-output"),
                formats=out.get("formats", ["html", "md", "csv"]),
                include_json=out.get("include_json", True),
                include_remediation_suggestions=out.get(
                    "include_remediation_suggestions", False
                ),
            )

        # Allow/deny lists
        if "allow_deny" in data:
            ad = data["allow_deny"]
            config.allow_deny = AllowDenyConfig(
                allowed_app_ids=ad.get("allowed_app_ids", []),
                denied_app_ids=ad.get("denied_app_ids", []),
                trusted_publisher_domains=ad.get("trusted_publisher_domains", []),
            )

        # Top-level settings
        config.mode = data.get("mode", "auto")
        config.enable_cache = data.get("enable_cache", True)
        config.cache_ttl_seconds = data.get("cache_ttl_seconds", 3600)
        config.log_level = data.get("log_level", "INFO")
        config.verbose = data.get("verbose", False)

        return config

    @classmethod
    def from_env(cls) -> "Config":
        """Create config from environment variables."""
        config = cls()

        # Auth from environment
        config.auth.tenant_id = os.environ.get("OAUTHKITCHEN_TENANT_ID", "")
        config.auth.client_id = os.environ.get("OAUTHKITCHEN_CLIENT_ID", "")
        config.auth.client_secret = os.environ.get("OAUTHKITCHEN_CLIENT_SECRET")
        config.auth.certificate_path = os.environ.get("OAUTHKITCHEN_CERT_PATH")
        config.auth.certificate_password = os.environ.get("OAUTHKITCHEN_CERT_PASSWORD")
        config.auth.use_device_code = (
            os.environ.get("OAUTHKITCHEN_USE_DEVICE_CODE", "").lower() == "true"
        )

        # Other settings
        config.mode = os.environ.get("OAUTHKITCHEN_MODE", "auto")
        config.log_level = os.environ.get("OAUTHKITCHEN_LOG_LEVEL", "INFO")
        config.verbose = os.environ.get("OAUTHKITCHEN_VERBOSE", "").lower() == "true"

        return config

    def to_dict(self) -> dict[str, Any]:
        """Convert config to dictionary for serialization."""
        return {
            "auth": {
                "tenant_id": self.auth.tenant_id,
                "client_id": self.auth.client_id,
                "client_secret": "***" if self.auth.client_secret else None,
                "certificate_path": self.auth.certificate_path,
                "use_device_code": self.auth.use_device_code,
            },
            "thresholds": {
                "credential_expiry_critical": self.thresholds.credential_expiry_critical,
                "credential_expiry_high": self.thresholds.credential_expiry_high,
                "credential_expiry_medium": self.thresholds.credential_expiry_medium,
                "credential_expiry_low": self.thresholds.credential_expiry_low,
                "inactive_days_threshold": self.thresholds.inactive_days_threshold,
                "credential_age_concern": self.thresholds.credential_age_concern,
            },
            "scoring": {
                "application_permission_multiplier": self.scoring.application_permission_multiplier,
                "delegated_permission_multiplier": self.scoring.delegated_permission_multiplier,
                "user_consent_weight": self.scoring.user_consent_weight,
                "admin_consent_weight": self.scoring.admin_consent_weight,
                "no_verified_publisher_weight": self.scoring.no_verified_publisher_weight,
                "external_multi_tenant_weight": self.scoring.external_multi_tenant_weight,
                "first_party_microsoft_weight": self.scoring.first_party_microsoft_weight,
                "no_owner_weight": self.scoring.no_owner_weight,
                "unused_high_privilege_weight": self.scoring.unused_high_privilege_weight,
            },
            "output": {
                "output_directory": self.output.output_directory,
                "formats": self.output.formats,
                "include_json": self.output.include_json,
                "include_remediation_suggestions": self.output.include_remediation_suggestions,
            },
            "allow_deny": {
                "allowed_app_ids": self.allow_deny.allowed_app_ids,
                "denied_app_ids": self.allow_deny.denied_app_ids,
                "trusted_publisher_domains": self.allow_deny.trusted_publisher_domains,
            },
            "mode": self.mode,
            "enable_cache": self.enable_cache,
            "cache_ttl_seconds": self.cache_ttl_seconds,
            "log_level": self.log_level,
            "verbose": self.verbose,
        }

    def save(self, path: str | Path) -> None:
        """Save configuration to a file."""
        path = Path(path)
        data = self.to_dict()

        # Don't save secrets
        data["auth"]["client_secret"] = None
        data["auth"]["certificate_password"] = None

        with open(path, "w", encoding="utf-8") as f:
            if path.suffix in (".yaml", ".yml"):
                yaml.dump(data, f, default_flow_style=False, sort_keys=False)
            else:
                json.dump(data, f, indent=2)


def create_sample_config() -> Config:
    """Create a sample configuration with sensible defaults."""
    config = Config()

    # Add some common trusted Microsoft app IDs (optional)
    # These are just examples - users should verify
    config.allow_deny.trusted_publisher_domains = [
        "microsoft.com",
        "azure.com",
    ]

    return config
