from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Building(Base):
    __tablename__ = "buildings"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    address = Column(String)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    floors = relationship("Floor", back_populates="building", cascade="all, delete-orphan")


class Floor(Base):
    __tablename__ = "floors"

    id = Column(Integer, primary_key=True, index=True)
    building_id = Column(Integer, ForeignKey("buildings.id"), nullable=False)
    floor_number = Column(Integer, nullable=False)
    floor_name = Column(String)
    floor_plan_path = Column(String)
    splat_path = Column(String)
    editor_splat_path = Column(String)
    editor_object_key = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    building = relationship("Building", back_populates="floors")
    spaces = relationship("Space", back_populates="floor", cascade="all, delete-orphan")


class Space(Base):
    __tablename__ = "spaces"

    id = Column(Integer, primary_key=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    space_type = Column(String, default="room")
    splat_path = Column(String)
    editor_splat_path = Column(String)
    editor_object_key = Column(String)
    object_key = Column(String)
    original_filename = Column(String)
    status = Column(String, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    floor = relationship("Floor", back_populates="spaces")
