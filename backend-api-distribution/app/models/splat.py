from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DoorSplat(Base):
    __tablename__ = "door_splats"
    __table_args__ = (
        UniqueConstraint("floor_id", "door_node_id", name="uq_door_splats_floor_door"),
    )

    id = Column(Integer, primary_key=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False, index=True)
    door_node_id = Column(String, nullable=False, index=True)
    room_name = Column(String)
    splat_path = Column(String, nullable=False)
    object_key = Column(String, nullable=False)
    original_filename = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    floor = relationship("Floor")
