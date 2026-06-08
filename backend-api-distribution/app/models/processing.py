from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.sql import func

from app.database import Base


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False, index=True)
    status = Column(String, nullable=False, default="queued", index=True)
    video_drive_url = Column(String, nullable=False)
    video_drive_file_id = Column(String)
    ply_url = Column(String)
    settings = Column(Text, nullable=False, default="{}")
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
