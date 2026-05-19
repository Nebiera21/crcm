from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from cryptography.fernet import Fernet, InvalidToken


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://crcm_user:changeme@postgres:5432/crcm"

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Fernet encryption key for SSH credentials
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    ENCRYPTION_KEY: str = ""

    # First admin (auto-created on first startup)
    FIRST_ADMIN_USERNAME: str = "admin"
    FIRST_ADMIN_EMAIL: str = "admin@localhost"
    FIRST_ADMIN_PASSWORD: str = "changeme"

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if not v:
            raise ValueError(
                "ENCRYPTION_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        try:
            Fernet(v.encode())
        except (ValueError, InvalidToken) as exc:
            raise ValueError(f"ENCRYPTION_KEY is not a valid Fernet key: {exc}") from exc
        return v

    def get_fernet(self) -> Fernet:
        return Fernet(self.ENCRYPTION_KEY.encode())


@lru_cache
def get_settings() -> Settings:
    return Settings()
