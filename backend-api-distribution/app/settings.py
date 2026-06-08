import os
import re

from dotenv import load_dotenv

load_dotenv()


def _getenv_stripped(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    stripped = value.strip().strip("\"'")
    return stripped or None


def _getenv_r2_bucket_name() -> str | None:
    value = _getenv_stripped("R2_BUCKET_NAME")
    if value is None:
        return None
    cleaned = re.sub(r"[\s\u200b\u200c\u200d\ufeff]+", "", value)
    return cleaned or None


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./building_api.db")
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def get_cors_origins() -> list[str]:
    origins = os.getenv(
        "CORS_ORIGIN",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


def get_app_host() -> str:
    return os.getenv("APP_HOST", "0.0.0.0")


def get_port() -> int:
    return int(os.getenv("PORT", "8000"))


def get_colab_api_key() -> str | None:
    return os.getenv("COLAB_API_KEY")


def get_google_drive_folder_id() -> str | None:
    return os.getenv("GOOGLE_DRIVE_FOLDER_ID")


def get_google_service_account_json() -> str | None:
    return os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")


def get_r2_account_id() -> str | None:
    return _getenv_stripped("R2_ACCOUNT_ID")


def get_r2_access_key_id() -> str | None:
    return _getenv_stripped("R2_ACCESS_KEY_ID")


def get_r2_secret_access_key() -> str | None:
    return _getenv_stripped("R2_SECRET_ACCESS_KEY")


def get_r2_bucket_name() -> str | None:
    return _getenv_r2_bucket_name()


def get_r2_public_base_url() -> str | None:
    return _getenv_stripped("R2_PUBLIC_BASE_URL")
