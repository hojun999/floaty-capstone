from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Node(BaseModel):
    id: str
    name: str
    type: Literal["door", "waypoint", "start", "destination"]
    x: float
    y: float
    z: float
    target_type: Literal["floor", "space"] | None = None
    target_floor_id: int | None = None
    target_space_id: int | None = None
    target_node_id: str | None = None


class Edge(BaseModel):
    id: str
    from_: str = Field(alias="from")
    to: str

    model_config = ConfigDict(populate_by_name=True)


class GraphPayload(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class FloorGraphResponse(BaseModel):
    floor_id: int
    floor_number: int | None = None
    floor_name: str | None = None
    splat_path: str | None = None
    graph: GraphPayload
    spaces: list["SpaceGraphResponse"] = []
    updated_at: datetime | None = None


class SpaceGraphResponse(BaseModel):
    space_id: int
    floor_id: int
    name: str | None = None
    space_type: str | None = None
    splat_path: str | None = None
    graph: GraphPayload
    updated_at: datetime | None = None


class BuildingGraphsResponse(BaseModel):
    building_id: int
    floors: list[FloorGraphResponse]


class PathResponse(BaseModel):
    floor_id: int
    path: list[Node]


class SpacePathResponse(BaseModel):
    space_id: int
    path: list[Node]


FloorGraphResponse.model_rebuild()
