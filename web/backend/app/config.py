import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "OAuthKitchen"
    debug: bool = False

    # Database - supports both SQLite (dev) and PostgreSQL (prod)
    database_url: str = "sqlite+aiosqlite:///./oauthkitchen.db"

    # JWT
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours

    # CORS - in production, set via environment variable
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"

    @property
    def async_database_url(self) -> str:
        """Convert DATABASE_URL to async version if needed."""
        url = self.database_url
        # Handle DigitalOcean/Heroku PostgreSQL URLs
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


@lru_cache()
def get_settings() -> Settings:
    return Settings()
