import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.models.building import Building, Floor
from app.models.processing import ProcessingJob
from app.schemas.processing import (
    ProcessingJobComplete,
    ProcessingJobFail,
    ProcessingJobNextResponse,
    ProcessingJobResponse,
    ProcessingJobStatusResponse,
)
from app.services.google_drive import upload_video_to_drive
from app.settings import get_colab_api_key

router = APIRouter()


@router.post("/jobs", response_model=ProcessingJobResponse)
def create_processing_job(
    building_name: str = Form(...),
    floor_number: int = Form(...),
    video_file: UploadFile = File(...),
    address: str | None = Form(None),
    description: str | None = Form(None),
    floor_name: str | None = Form(None),
    settings: str = Form("{}"),
    db: Session = Depends(get_db),
):
    parsed_settings = _parse_settings(settings)

    building = _get_or_create_building(db, building_name, address, description)
    floor = _get_or_create_floor(db, building.id, floor_number, floor_name)

    try:
        upload_result = upload_video_to_drive(video_file)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    job = ProcessingJob(
        building_id=building.id,
        floor_id=floor.id,
        status="queued",
        video_drive_url=upload_result.url,
        video_drive_file_id=upload_result.file_id,
        settings=json.dumps(parsed_settings),
    )
    floor.status = "queued"
    db.add(job)
    db.commit()
    db.refresh(job)
    return _job_response(job)


@router.get("/jobs/next", response_model=ProcessingJobNextResponse | None)
def get_next_processing_job(
    db: Session = Depends(get_db),
    x_colab_api_key: str | None = Header(None),
):
    _verify_colab_api_key(x_colab_api_key)

    query = (
        db.query(ProcessingJob)
        .filter(ProcessingJob.status == "queued")
        .order_by(ProcessingJob.created_at.asc(), ProcessingJob.id.asc())
    )
    if engine.dialect.name != "sqlite":
        query = query.with_for_update(skip_locked=True)

    job = query.first()
    if job is None:
        return None

    now = _utcnow()
    job.status = "processing"
    job.started_at = now

    floor = db.query(Floor).filter(Floor.id == job.floor_id).first()
    if floor:
        floor.status = "processing"

    db.commit()
    db.refresh(job)
    return _next_job_response(db, job)


@router.post("/jobs/{job_id}/complete", response_model=ProcessingJobStatusResponse)
def complete_processing_job(
    job_id: int,
    payload: ProcessingJobComplete,
    db: Session = Depends(get_db),
    x_colab_api_key: str | None = Header(None),
):
    _verify_colab_api_key(x_colab_api_key)
    job = _get_job(db, job_id)
    if job.status != "processing":
        raise HTTPException(
            status_code=409,
            detail=f"Only processing jobs can be completed. Current status: {job.status}",
        )

    now = _utcnow()
    job.status = "completed"
    job.ply_url = payload.ply_url
    job.error_message = None
    job.completed_at = now

    floor = db.query(Floor).filter(Floor.id == job.floor_id).first()
    if floor:
        floor.status = "completed"
        floor.splat_path = payload.ply_url

    db.commit()
    db.refresh(job)
    return _status_response(job)


@router.post("/jobs/{job_id}/fail", response_model=ProcessingJobStatusResponse)
def fail_processing_job(
    job_id: int,
    payload: ProcessingJobFail,
    db: Session = Depends(get_db),
    x_colab_api_key: str | None = Header(None),
):
    _verify_colab_api_key(x_colab_api_key)
    job = _get_job(db, job_id)
    if job.status not in {"queued", "processing"}:
        raise HTTPException(
            status_code=409,
            detail=f"Only queued or processing jobs can fail. Current status: {job.status}",
        )

    job.status = "failed"
    job.error_message = payload.error_message
    job.completed_at = _utcnow()

    floor = db.query(Floor).filter(Floor.id == job.floor_id).first()
    if floor:
        floor.status = "failed"

    db.commit()
    db.refresh(job)
    return _status_response(job)


@router.get("/jobs/{job_id}/status", response_model=ProcessingJobStatusResponse)
def get_processing_job_status(job_id: int, db: Session = Depends(get_db)):
    return _status_response(_get_job(db, job_id))


def _get_or_create_building(
    db: Session,
    name: str,
    address: str | None,
    description: str | None,
) -> Building:
    building = db.query(Building).filter(Building.name == name).first()
    if building:
        return building

    building = Building(name=name, address=address, description=description)
    db.add(building)
    db.flush()
    return building


def _get_or_create_floor(
    db: Session,
    building_id: int,
    floor_number: int,
    floor_name: str | None,
) -> Floor:
    floor = (
        db.query(Floor)
        .filter(Floor.building_id == building_id, Floor.floor_number == floor_number)
        .first()
    )
    if floor:
        return floor

    floor = Floor(
        building_id=building_id,
        floor_number=floor_number,
        floor_name=floor_name,
        status="pending",
    )
    db.add(floor)
    db.flush()
    return floor


def _get_job(db: Session, job_id: int) -> ProcessingJob:
    job = db.query(ProcessingJob).filter(ProcessingJob.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Processing job not found")
    return job


def _parse_settings(settings: str) -> dict[str, Any]:
    try:
        parsed = json.loads(settings)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="settings must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=422, detail="settings must be a JSON object")
    return parsed


def _verify_colab_api_key(api_key: str | None) -> None:
    expected = get_colab_api_key()
    if not expected:
        raise HTTPException(status_code=503, detail="COLAB_API_KEY is not configured")
    if api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid Colab API key")


def _job_response(job: ProcessingJob) -> ProcessingJobResponse:
    return ProcessingJobResponse(
        id=job.id,
        building_id=job.building_id,
        floor_id=job.floor_id,
        status=job.status,
        video_drive_url=job.video_drive_url,
        video_drive_file_id=job.video_drive_file_id,
        ply_url=job.ply_url,
        settings=json.loads(job.settings or "{}"),
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        updated_at=job.updated_at,
    )


def _next_job_response(db: Session, job: ProcessingJob) -> ProcessingJobNextResponse:
    response = _job_response(job).model_dump()
    building = db.query(Building).filter(Building.id == job.building_id).first()
    floor = db.query(Floor).filter(Floor.id == job.floor_id).first()
    return ProcessingJobNextResponse(
        **response,
        building_name=building.name if building else "",
        floor_number=floor.floor_number if floor else 0,
        floor_name=floor.floor_name if floor else None,
    )


def _status_response(job: ProcessingJob) -> ProcessingJobStatusResponse:
    return ProcessingJobStatusResponse(
        id=job.id,
        building_id=job.building_id,
        floor_id=job.floor_id,
        status=job.status,
        ply_url=job.ply_url,
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        updated_at=job.updated_at,
    )


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
