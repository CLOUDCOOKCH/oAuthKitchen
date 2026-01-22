"""
Microsoft Graph API client for OAuthKitchen.

Supports certificate-based auth (primary), client secret, and device code flow.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator, Optional

import msal
import requests

from oauthkitchen.config import AuthConfig, Config
from oauthkitchen.utils.cache import Cache
from oauthkitchen.utils.logging import get_logger

logger = get_logger("graph_client")

# Graph API base URL
GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"
GRAPH_BETA_URL = "https://graph.microsoft.com/beta"

# Required scopes for different modes
SCOPES_LIMITED = [
    "Application.Read.All",
    "Directory.Read.All",
]

SCOPES_FULL = [
    "Application.Read.All",
    "Directory.Read.All",
    "AuditLog.Read.All",  # For sign-in activity (requires additional license)
]

# Default scope for client credentials flow
DEFAULT_SCOPE = ["https://graph.microsoft.com/.default"]


@dataclass
class GraphResponse:
    """Wrapper for Graph API responses."""
    status_code: int
    data: dict[str, Any] | list[Any] | None
    error: str | None = None
    headers: dict[str, str] | None = None


class GraphClientError(Exception):
    """Exception raised for Graph API errors."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code


class GraphClient:
    """
    Microsoft Graph API client with authentication and pagination support.

    Authentication methods (in priority order):
    1. Certificate-based authentication (recommended for automation)
    2. Client secret (simpler but less secure)
    3. Device code flow (interactive, for development)
    """

    def __init__(
        self,
        config: Config,
        cache: Optional[Cache] = None
    ):
        """
        Initialize the Graph client.

        Args:
            config: Configuration object with auth settings
            cache: Optional cache for API responses
        """
        self.config = config
        self.auth_config = config.auth
        self.cache = cache or Cache(ttl_seconds=config.cache_ttl_seconds)

        self._access_token: Optional[str] = None
        self._token_expires_at: float = 0
        self._msal_app: Optional[msal.ConfidentialClientApplication] = None
        self._session = requests.Session()

        # Detected capabilities
        self.sign_in_logs_available: bool = False
        self.audit_logs_available: bool = False

    def authenticate(self) -> None:
        """
        Authenticate with Microsoft Graph.

        Tries authentication methods in order:
        1. Certificate
        2. Client secret
        3. Device code (if enabled)

        Raises:
            GraphClientError: If authentication fails
        """
        logger.info("Authenticating with Microsoft Graph...")

        if not self.auth_config.tenant_id:
            raise GraphClientError("Tenant ID is required for authentication")

        if not self.auth_config.client_id:
            raise GraphClientError("Client ID is required for authentication")

        # Try certificate auth first
        if self.auth_config.certificate_path:
            self._authenticate_with_certificate()
        # Then try client secret
        elif self.auth_config.client_secret:
            self._authenticate_with_secret()
        # Finally try device code
        elif self.auth_config.use_device_code:
            self._authenticate_with_device_code()
        else:
            raise GraphClientError(
                "No authentication method configured. "
                "Provide certificate_path, client_secret, or enable use_device_code"
            )

        logger.info("Authentication successful")
        self._detect_capabilities()

    def _authenticate_with_certificate(self) -> None:
        """Authenticate using certificate."""
        cert_path = Path(self.auth_config.certificate_path)  # type: ignore
        if not cert_path.exists():
            raise GraphClientError(f"Certificate file not found: {cert_path}")

        logger.debug("Authenticating with certificate: %s", cert_path)

        # Load certificate
        with open(cert_path, "rb") as f:
            cert_data = f.read()

        # Create MSAL app with certificate
        self._msal_app = msal.ConfidentialClientApplication(
            client_id=self.auth_config.client_id,
            authority=f"https://login.microsoftonline.com/{self.auth_config.tenant_id}",
            client_credential={
                "private_key": cert_data,
                "thumbprint": self._get_cert_thumbprint(cert_data),
                "passphrase": self.auth_config.certificate_password,
            }
        )

        self._acquire_token_client_credentials()

    def _get_cert_thumbprint(self, cert_data: bytes) -> str:
        """Extract certificate thumbprint."""
        # This is a simplified implementation
        # In production, use cryptography library for proper handling
        try:
            from cryptography import x509
            from cryptography.hazmat.backends import default_backend
            from cryptography.hazmat.primitives import hashes
            import base64

            # Try to load as PEM
            cert = x509.load_pem_x509_certificate(cert_data, default_backend())
            thumbprint = cert.fingerprint(hashes.SHA1())
            return base64.b64encode(thumbprint).decode()
        except ImportError:
            # Fallback: assume thumbprint is provided or compute basic hash
            import hashlib
            return hashlib.sha1(cert_data).hexdigest()

    def _authenticate_with_secret(self) -> None:
        """Authenticate using client secret."""
        logger.debug("Authenticating with client secret")

        self._msal_app = msal.ConfidentialClientApplication(
            client_id=self.auth_config.client_id,
            authority=f"https://login.microsoftonline.com/{self.auth_config.tenant_id}",
            client_credential=self.auth_config.client_secret
        )

        self._acquire_token_client_credentials()

    def _acquire_token_client_credentials(self) -> None:
        """Acquire token using client credentials flow."""
        if not self._msal_app:
            raise GraphClientError("MSAL app not initialized")

        result = self._msal_app.acquire_token_for_client(scopes=DEFAULT_SCOPE)

        if "access_token" not in result:
            error = result.get("error_description", result.get("error", "Unknown error"))
            raise GraphClientError(f"Failed to acquire token: {error}")

        self._access_token = result["access_token"]
        # Token typically valid for 1 hour, refresh 5 minutes early
        self._token_expires_at = time.time() + result.get("expires_in", 3600) - 300

    def _authenticate_with_device_code(self) -> None:
        """Authenticate using device code flow (interactive)."""
        logger.info("Starting device code authentication flow...")

        app = msal.PublicClientApplication(
            client_id=self.auth_config.client_id,
            authority=f"https://login.microsoftonline.com/{self.auth_config.tenant_id}"
        )

        # Determine scopes based on mode
        scopes = SCOPES_FULL if self.config.mode == "full" else SCOPES_LIMITED

        flow = app.initiate_device_flow(scopes=scopes)
        if "user_code" not in flow:
            raise GraphClientError(
                f"Failed to initiate device flow: {flow.get('error_description', 'Unknown error')}"
            )

        # Print instructions for user
        print("\n" + "=" * 60)
        print("DEVICE CODE AUTHENTICATION")
        print("=" * 60)
        print(f"\nTo authenticate, visit: {flow['verification_uri']}")
        print(f"Enter code: {flow['user_code']}")
        print("\nWaiting for authentication...")
        print("=" * 60 + "\n")

        result = app.acquire_token_by_device_flow(flow)

        if "access_token" not in result:
            error = result.get("error_description", result.get("error", "Unknown error"))
            raise GraphClientError(f"Device code authentication failed: {error}")

        self._access_token = result["access_token"]
        self._token_expires_at = time.time() + result.get("expires_in", 3600) - 300

    def _ensure_token_valid(self) -> None:
        """Ensure we have a valid access token, refreshing if needed."""
        if not self._access_token or time.time() >= self._token_expires_at:
            if self._msal_app:
                self._acquire_token_client_credentials()
            else:
                raise GraphClientError("Token expired and no refresh mechanism available")

    def _detect_capabilities(self) -> None:
        """Detect what data we can access based on permissions."""
        # Try to access sign-in logs to detect availability
        try:
            response = self._make_request(
                "GET",
                f"{GRAPH_BETA_URL}/auditLogs/signIns",
                params={"$top": "1"}
            )
            self.sign_in_logs_available = response.status_code == 200
        except GraphClientError:
            self.sign_in_logs_available = False

        if not self.sign_in_logs_available:
            logger.warning(
                "Sign-in logs not available. Running in limited mode. "
                "This may be due to missing AuditLog.Read.All permission or "
                "Azure AD P1/P2 license requirement."
            )

    def _make_request(
        self,
        method: str,
        url: str,
        params: Optional[dict[str, Any]] = None,
        json_data: Optional[dict[str, Any]] = None,
        use_cache: bool = True
    ) -> GraphResponse:
        """
        Make an authenticated request to Graph API.

        Args:
            method: HTTP method (GET, POST, etc.)
            url: Full URL to request
            params: Query parameters
            json_data: JSON body for POST/PATCH
            use_cache: Whether to use caching (GET only)

        Returns:
            GraphResponse with status, data, and any error
        """
        self._ensure_token_valid()

        # Check cache for GET requests
        if use_cache and method.upper() == "GET" and self.cache:
            cache_key = f"{method}:{url}:{params}"
            cached = self.cache.get(cache_key)
            if cached is not None:
                logger.debug("Cache hit: %s", url)
                return GraphResponse(status_code=200, data=cached)

        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        try:
            response = self._session.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
                headers=headers,
                timeout=60
            )

            data = None
            error = None

            if response.status_code == 200:
                try:
                    data = response.json()
                except ValueError:
                    data = None
            elif response.status_code == 204:
                data = None
            else:
                try:
                    error_data = response.json()
                    error = error_data.get("error", {}).get("message", response.text)
                except ValueError:
                    error = response.text

            result = GraphResponse(
                status_code=response.status_code,
                data=data,
                error=error,
                headers=dict(response.headers)
            )

            # Cache successful GET requests
            if use_cache and method.upper() == "GET" and response.status_code == 200 and self.cache:
                cache_key = f"{method}:{url}:{params}"
                self.cache.set(cache_key, data)

            return result

        except requests.RequestException as e:
            logger.error("Request failed: %s", e)
            raise GraphClientError(f"Request failed: {e}")

    def get(
        self,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        use_beta: bool = False,
        use_cache: bool = True
    ) -> GraphResponse:
        """
        Make a GET request to Graph API.

        Args:
            endpoint: API endpoint (without base URL)
            params: Query parameters
            use_beta: Use beta API instead of v1.0
            use_cache: Whether to use caching

        Returns:
            GraphResponse
        """
        base = GRAPH_BETA_URL if use_beta else GRAPH_BASE_URL
        url = f"{base}/{endpoint.lstrip('/')}"
        return self._make_request("GET", url, params=params, use_cache=use_cache)

    def get_all_pages(
        self,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        use_beta: bool = False,
        page_size: int = 100
    ) -> Iterator[dict[str, Any]]:
        """
        Get all pages of a paginated Graph API response.

        Yields individual items from each page.

        Args:
            endpoint: API endpoint
            params: Query parameters
            use_beta: Use beta API
            page_size: Number of items per page

        Yields:
            Individual items from the response
        """
        params = params or {}
        if "$top" not in params:
            params["$top"] = str(page_size)

        base = GRAPH_BETA_URL if use_beta else GRAPH_BASE_URL
        url = f"{base}/{endpoint.lstrip('/')}"

        while url:
            response = self._make_request("GET", url, params=params, use_cache=False)

            if response.status_code != 200:
                logger.error(
                    "Failed to fetch page: %s - %s",
                    response.status_code,
                    response.error
                )
                break

            if response.data and "value" in response.data:
                for item in response.data["value"]:
                    yield item

            # Get next page URL
            url = response.data.get("@odata.nextLink") if response.data else None
            params = {}  # Next link includes all params

    def get_count(
        self,
        endpoint: str,
        params: Optional[dict[str, Any]] = None,
        use_beta: bool = False
    ) -> int:
        """
        Get the count of items at an endpoint.

        Args:
            endpoint: API endpoint
            params: Query parameters
            use_beta: Use beta API

        Returns:
            Count of items, or -1 if count not available
        """
        params = params or {}
        params["$count"] = "true"
        params["$top"] = "1"

        response = self.get(endpoint, params=params, use_beta=use_beta)

        if response.status_code == 200 and response.data:
            return response.data.get("@odata.count", -1)
        return -1


def create_graph_client(config: Config) -> GraphClient:
    """
    Factory function to create and authenticate a Graph client.

    Args:
        config: Configuration object

    Returns:
        Authenticated GraphClient instance
    """
    cache = Cache(
        ttl_seconds=config.cache_ttl_seconds,
        persist_path=Path(config.output.output_directory) / ".cache.json"
        if config.enable_cache else None
    )

    client = GraphClient(config=config, cache=cache)
    client.authenticate()

    return client