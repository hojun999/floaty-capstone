from dataclasses import dataclass
import logging
from uuid import uuid4

from fastapi import UploadFile

from app.settings import (
    get_r2_access_key_id,
    get_r2_account_id,
    get_r2_bucket_name,
    get_r2_public_base_url,
    get_r2_secret_access_key,
)

logger = logging.getLogger(__name__)


@dataclass
class R2UploadResult:
    object_key: str
    url: str
    original_filename: str | None


@dataclass
class R2ObjectResult:
    body: object
    content_length: int | None
    content_type: str


def upload_ply_to_r2(file: UploadFile, prefix: str) -> R2UploadResult:
    _validate_ply_file(file)
    account_id = get_r2_account_id()
    access_key_id = get_r2_access_key_id()
    secret_access_key = get_r2_secret_access_key()
    bucket_name = get_r2_bucket_name()
    public_base_url = get_r2_public_base_url()
    if not all([account_id, access_key_id, secret_access_key, bucket_name, public_base_url]):
        raise RuntimeError(
            "Cloudflare R2 upload is not configured. Set R2_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and "
            "R2_PUBLIC_BASE_URL."
        )

    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is not installed. Install project dependencies.") from exc

    object_key = _build_object_key(prefix)
    try:
        file.file.seek(0)
        logger.info(
            "Uploading splat to R2 bucket=%r bucket_len=%s object_key=%s",
            bucket_name,
            len(bucket_name),
            object_key,
        )
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )
        client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=file.file,
            ContentType="application/octet-stream",
        )
    except Exception as exc:
        raise RuntimeError(
            f"Cloudflare R2 upload failed: {exc.__class__.__name__}: {exc}"
        ) from exc
    return R2UploadResult(
        object_key=object_key,
        url=f"{public_base_url.rstrip('/')}/{object_key}",
        original_filename=file.filename,
    )


def get_ply_object_from_r2(object_key: str) -> R2ObjectResult:
    account_id = get_r2_account_id()
    access_key_id = get_r2_access_key_id()
    secret_access_key = get_r2_secret_access_key()
    bucket_name = get_r2_bucket_name()
    if not all([account_id, access_key_id, secret_access_key, bucket_name]):
        raise RuntimeError(
            "Cloudflare R2 download is not configured. Set R2_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
        )

    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError("boto3 is not installed. Install project dependencies.") from exc

    try:
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )
        response = client.get_object(Bucket=bucket_name, Key=object_key)
    except Exception as exc:
        raise RuntimeError(
            f"Cloudflare R2 download failed: {exc.__class__.__name__}: {exc}"
        ) from exc

    return R2ObjectResult(
        body=response["Body"],
        content_length=response.get("ContentLength"),
        content_type=response.get("ContentType") or "application/octet-stream",
    )


def object_key_from_public_url(url: str | None) -> str | None:
    if not url:
        return None

    public_base_url = get_r2_public_base_url()
    if public_base_url:
        prefix = f"{public_base_url.rstrip('/')}/"
        if url.startswith(prefix):
            return url[len(prefix):].lstrip("/")

    marker = "/buildings/"
    if marker in url:
        return f"buildings/{url.split(marker, 1)[1]}".lstrip("/")

    return None


def _validate_ply_file(file: UploadFile) -> None:
    filename = file.filename or ""
    if not filename.lower().endswith(".ply"):
        raise ValueError("Only .ply files are allowed")


def _build_object_key(prefix: str) -> str:
    return f"{prefix.strip('/')}/{uuid4().hex}.ply"
