from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


JobStatus = Literal["queued", "processing", "completed", "failed"]


class ProcessingJobCreate(BaseModel):
    building_name: str
    address: Optional[str] = None
    description: Optional[str] = None
    floor_number: int
    floor_name: Optional[str] = None
    settings: dict[str, Any] = Field(default_factory=dict)


class ProcessingJobResponse(BaseModel):
    id: int
    building_id: int
    floor_id: int
    status: JobStatus
    video_drive_url: str
    video_drive_file_id: Optional[str]
    ply_url: Optional[str]
    settings: dict[str, Any]
    error_message: Optional[str]
    created_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)


class ProcessingJobNextResponse(ProcessingJobResponse):
    building_name: str
    floor_number: int
    floor_name: Optional[str]


class ProcessingJobComplete(BaseModel):
    ply_url: str


class ProcessingJobFail(BaseModel):
    error_message: str


class ProcessingJobStatusResponse(BaseModel):
    id: int
    building_id: int
    floor_id: int
    status: JobStatus
    ply_url: Optional[str]
    error_message: Optional[str]
    created_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: Optional[datetime]
