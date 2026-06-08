from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FloorSplatResponse(BaseModel):
    building_id: int
    floor_id: int
    floor_number: int
    floor_name: str | None
    splat_path: str | None
    status: str


class DoorSplatResponse(BaseModel):
    id: int
    building_id: int
    floor_id: int
    door_node_id: str
    room_name: str | None
    splat_path: str
    object_key: str
    original_filename: str | None
    created_at: datetime | None
    updated_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
