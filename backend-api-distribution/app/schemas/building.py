from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class BuildingCreate(BaseModel):
    name: str
    address: Optional[str] = None
    description: Optional[str] = None


class BuildingUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None


class BuildingResponse(BaseModel):
    id: int
    name: str
    address: Optional[str]
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class FloorCreate(BaseModel):
    building_id: int
    floor_number: int
    floor_name: Optional[str] = None


class FloorUpdate(BaseModel):
    floor_name: Optional[str] = None
    status: Optional[str] = None


class FloorResponse(BaseModel):
    id: int
    building_id: int
    floor_number: int
    floor_name: Optional[str]
    floor_plan_path: Optional[str]
    splat_path: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class SpaceCreate(BaseModel):
    floor_id: int
    name: str
    space_type: Optional[str] = "room"


class SpaceUpdate(BaseModel):
    name: Optional[str] = None
    space_type: Optional[str] = None
    status: Optional[str] = None


class SpaceResponse(BaseModel):
    id: int
    floor_id: int
    name: str
    space_type: Optional[str]
    splat_path: Optional[str]
    object_key: Optional[str]
    original_filename: Optional[str]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
