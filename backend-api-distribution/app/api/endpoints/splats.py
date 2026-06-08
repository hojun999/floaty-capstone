import json
import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.building import Building, Floor
from app.models.navigation import NavigationGraph
from app.models.splat import DoorSplat
from app.schemas.navigation import GraphPayload
from app.schemas.splat import DoorSplatResponse, FloorSplatResponse
from app.services.r2_storage import upload_ply_to_r2

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/splats/buildings/{building_id}/floors/{floor_id}",
    response_model=FloorSplatResponse,
)
def upload_floor_splat(
    building_id: int,
    floor_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    floor = _get_floor_for_building(db, building_id, floor_id)
    upload = _upload_or_error(file, f"buildings/{building_id}/floors/{floor_id}")

    floor.splat_path = upload.url
    floor.status = "completed"
    db.commit()
    db.refresh(floor)
    return _floor_splat_response(floor)


@router.get(
    "/splats/buildings/{building_id}/floors/{floor_id}",
    response_model=FloorSplatResponse,
)
def get_floor_splat(
    building_id: int,
    floor_id: int,
    db: Session = Depends(get_db),
):
    floor = _get_floor_for_building(db, building_id, floor_id)
    return _floor_splat_response(floor)


@router.post(
    "/splats/buildings/{building_id}/floors/{floor_id}/doors/{door_node_id}",
    response_model=DoorSplatResponse,
)
def upload_door_splat(
    building_id: int,
    floor_id: int,
    door_node_id: str,
    file: UploadFile = File(...),
    room_name: str | None = Form(None),
    db: Session = Depends(get_db),
):
    _get_floor_for_building(db, building_id, floor_id)
    _ensure_door_node(db, floor_id, door_node_id)
    upload = _upload_or_error(
        file,
        f"buildings/{building_id}/floors/{floor_id}/doors/{door_node_id}",
    )

    splat = (
        db.query(DoorSplat)
        .filter(
            DoorSplat.floor_id == floor_id,
            DoorSplat.door_node_id == door_node_id,
        )
        .first()
    )
    if splat:
        splat.room_name = room_name
        splat.splat_path = upload.url
        splat.object_key = upload.object_key
        splat.original_filename = upload.original_filename
    else:
        splat = DoorSplat(
            floor_id=floor_id,
            door_node_id=door_node_id,
            room_name=room_name,
            splat_path=upload.url,
            object_key=upload.object_key,
            original_filename=upload.original_filename,
        )
        db.add(splat)

    db.commit()
    db.refresh(splat)
    return _door_splat_response(building_id, splat)


@router.get(
    "/splats/buildings/{building_id}/floors/{floor_id}/doors",
    response_model=list[DoorSplatResponse],
)
def get_floor_door_splats(
    building_id: int,
    floor_id: int,
    db: Session = Depends(get_db),
):
    _get_floor_for_building(db, building_id, floor_id)
    splats = db.query(DoorSplat).filter(DoorSplat.floor_id == floor_id).all()
    return [_door_splat_response(building_id, splat) for splat in splats]


@router.get(
    "/splats/buildings/{building_id}/floors/{floor_id}/doors/{door_node_id}",
    response_model=DoorSplatResponse,
)
def get_door_splat(
    building_id: int,
    floor_id: int,
    door_node_id: str,
    db: Session = Depends(get_db),
):
    _get_floor_for_building(db, building_id, floor_id)
    splat = (
        db.query(DoorSplat)
        .filter(
            DoorSplat.floor_id == floor_id,
            DoorSplat.door_node_id == door_node_id,
        )
        .first()
    )
    if not splat:
        raise HTTPException(status_code=404, detail="Door splat not found")
    return _door_splat_response(building_id, splat)


def _get_floor_for_building(db: Session, building_id: int, floor_id: int) -> Floor:
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    floor = (
        db.query(Floor)
        .filter(Floor.id == floor_id, Floor.building_id == building_id)
        .first()
    )
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found for building")
    return floor


def _ensure_door_node(db: Session, floor_id: int, door_node_id: str) -> None:
    graph = db.query(NavigationGraph).filter(NavigationGraph.floor_id == floor_id).first()
    if graph is None:
        raise HTTPException(status_code=404, detail="Navigation graph not found")
    payload = _load_graph_payload(graph)
    node = next((node for node in payload.nodes if node.id == door_node_id), None)
    if node is None:
        raise HTTPException(status_code=404, detail="Door node not found")
    if node.type != "door":
        raise HTTPException(status_code=422, detail="Node is not a door")


def _load_graph_payload(graph: NavigationGraph) -> GraphPayload:
    data = json.loads(graph.data)
    for node in data.get("nodes", []):
        if node.get("type") == "room":
            node["type"] = "door"
    return GraphPayload.model_validate(data)


def _upload_or_error(file: UploadFile, prefix: str):
    try:
        return upload_ply_to_r2(file, prefix)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("Splat upload failed for prefix=%s filename=%s", prefix, file.filename)
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _floor_splat_response(floor: Floor) -> FloorSplatResponse:
    return FloorSplatResponse(
        building_id=floor.building_id,
        floor_id=floor.id,
        floor_number=floor.floor_number,
        floor_name=floor.floor_name,
        splat_path=floor.splat_path,
        status=floor.status,
    )


def _door_splat_response(building_id: int, splat: DoorSplat) -> DoorSplatResponse:
    return DoorSplatResponse(
        id=splat.id,
        building_id=building_id,
        floor_id=splat.floor_id,
        door_node_id=splat.door_node_id,
        room_name=splat.room_name,
        splat_path=splat.splat_path,
        object_key=splat.object_key,
        original_filename=splat.original_filename,
        created_at=splat.created_at,
        updated_at=splat.updated_at,
    )
