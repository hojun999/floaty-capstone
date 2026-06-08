import json
from dataclasses import dataclass
from io import BytesIO

from fastapi import UploadFile

from app.settings import get_google_drive_folder_id, get_google_service_account_json


@dataclass
class DriveUploadResult:
    file_id: str
    url: str


def upload_video_to_drive(video_file: UploadFile) -> DriveUploadResult:
    service_account_json = get_google_service_account_json()
    folder_id = get_google_drive_folder_id()
    if not service_account_json or not folder_id:
        raise RuntimeError(
            "Google Drive upload is not configured. Set "
            "GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_FOLDER_ID."
        )

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaIoBaseUpload
    except ImportError as exc:
        raise RuntimeError(
            "Google Drive dependencies are not installed. Install "
            "google-api-python-client, google-auth, and google-auth-httplib2."
        ) from exc

    credentials_info = json.loads(service_account_json)
    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    drive = build("drive", "v3", credentials=credentials)

    content = video_file.file.read()
    media = MediaIoBaseUpload(
        BytesIO(content),
        mimetype=video_file.content_type or "application/octet-stream",
        resumable=False,
    )
    metadata = {
        "name": video_file.filename or "upload-video",
        "parents": [folder_id],
    }

    uploaded = (
        drive.files()
        .create(
            body=metadata,
            media_body=media,
            fields="id, webViewLink",
        )
        .execute()
    )
    file_id = uploaded["id"]

    drive.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        fields="id",
    ).execute()

    return DriveUploadResult(
        file_id=file_id,
        url=uploaded.get("webViewLink")
        or f"https://drive.google.com/file/d/{file_id}/view",
    )
