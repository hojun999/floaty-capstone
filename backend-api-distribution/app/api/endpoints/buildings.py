from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.building import Building, Floor, Space
from app.models.navigation import NavigationGraph, SpaceNavigationGraph
from app.models.processing import ProcessingJob
from app.models.splat import DoorSplat
from app.schemas.building import (
    BuildingCreate,
    BuildingResponse,
    BuildingUpdate,
    FloorCreate,
    FloorResponse,
    FloorUpdate,
    SpaceCreate,
    SpaceResponse,
    SpaceUpdate,
)
from app.services.r2_storage import (
    get_ply_object_from_r2,
    object_key_from_public_url,
    upload_ply_bytes_to_r2,
)
from app.services.ply_editor_cut import PlyCutError, create_editor_cut_ply_bytes

router = APIRouter()


@router.post("/buildings", response_model=BuildingResponse)
def create_building(data: BuildingCreate, db: Session = Depends(get_db)):
    building = Building(**data.model_dump())
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


@router.get("/buildings", response_model=List[BuildingResponse])
def get_buildings(db: Session = Depends(get_db)):
    return db.query(Building).all()


@router.get("/buildings/{building_id}", response_model=BuildingResponse)
def get_building(building_id: int, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.patch("/buildings/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: int,
    data: BuildingUpdate,
    db: Session = Depends(get_db),
):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(building, key, value)
    db.commit()
    db.refresh(building)
    return building


@router.delete("/buildings/{building_id}")
def delete_building(building_id: int, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    floor_ids = [
        floor_id
        for (floor_id,) in db.query(Floor.id).filter(Floor.building_id == building_id).all()
    ]
    _delete_floor_dependents(db, floor_ids)
    db.query(ProcessingJob).filter(ProcessingJob.building_id == building_id).delete(
        synchronize_session=False
    )
    db.delete(building)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/floors", response_model=FloorResponse)
def create_floor(data: FloorCreate, db: Session = Depends(get_db)):
    floor = Floor(**data.model_dump())
    db.add(floor)
    db.commit()
    db.refresh(floor)
    return floor


@router.get("/floors", response_model=List[FloorResponse])
def get_floors(building_id: int, db: Session = Depends(get_db)):
    return db.query(Floor).filter(Floor.building_id == building_id).all()


@router.get("/floors/{floor_id}", response_model=FloorResponse)
def get_floor(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return floor


@router.patch("/floors/{floor_id}", response_model=FloorResponse)
def update_floor(
    floor_id: int,
    data: FloorUpdate,
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(floor, key, value)
    db.commit()
    db.refresh(floor)
    return floor


@router.delete("/floors/{floor_id}")
def delete_floor(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    _delete_floor_dependents(db, [floor_id])
    db.delete(floor)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/floors/{floor_id}/ply", response_model=FloorResponse)
def upload_floor_ply(
    floor_id: int,
    ply_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    upload, editor_upload = _upload_ply_pair_or_error(
        ply_file,
        f"buildings/{floor.building_id}/floors/{floor.id}",
        f"buildings/{floor.building_id}/floors/{floor.id}/editor",
    )
    floor.splat_path = upload.url
    floor.editor_splat_path = editor_upload.url
    floor.editor_object_key = editor_upload.object_key
    floor.status = "completed"
    db.commit()
    db.refresh(floor)
    return floor


@router.get("/floors/{floor_id}/ply-file")
def get_floor_ply_file(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return _stream_ply_or_error(
        object_key_from_public_url(floor.splat_path),
        f"floor-{floor.id}.ply",
    )


@router.get("/floors/{floor_id}/editor-ply-file")
def get_floor_editor_ply_file(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return _stream_ply_or_error(
        floor.editor_object_key or object_key_from_public_url(floor.editor_splat_path),
        f"floor-{floor.id}-editor.ply",
    )


@router.post("/spaces", response_model=SpaceResponse)
def create_space(data: SpaceCreate, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == data.floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    space = Space(**data.model_dump())
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


@router.get("/spaces", response_model=List[SpaceResponse])
def get_spaces(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")
    return db.query(Space).filter(Space.floor_id == floor_id).all()


@router.get("/spaces/{space_id}", response_model=SpaceResponse)
def get_space(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return space


@router.patch("/spaces/{space_id}", response_model=SpaceResponse)
def update_space(
    space_id: int,
    data: SpaceUpdate,
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(space, key, value)
    db.commit()
    db.refresh(space)
    return space


@router.delete("/spaces/{space_id}")
def delete_space(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    db.query(SpaceNavigationGraph).filter(SpaceNavigationGraph.space_id == space_id).delete(
        synchronize_session=False
    )
    db.delete(space)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/spaces/{space_id}/ply", response_model=SpaceResponse)
def upload_space_ply(
    space_id: int,
    ply_file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    floor = db.query(Floor).filter(Floor.id == space.floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    upload, editor_upload = _upload_ply_pair_or_error(
        ply_file,
        f"buildings/{floor.building_id}/floors/{floor.id}/spaces/{space.id}",
        f"buildings/{floor.building_id}/floors/{floor.id}/spaces/{space.id}/editor",
    )
    space.splat_path = upload.url
    space.editor_splat_path = editor_upload.url
    space.editor_object_key = editor_upload.object_key
    space.object_key = upload.object_key
    space.original_filename = upload.original_filename
    space.status = "completed"
    db.commit()
    db.refresh(space)
    return space


@router.get("/spaces/{space_id}/ply-file")
def get_space_ply_file(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return _stream_ply_or_error(
        space.object_key or object_key_from_public_url(space.splat_path),
        f"space-{space.id}.ply",
    )


@router.get("/spaces/{space_id}/editor-ply-file")
def get_space_editor_ply_file(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")
    return _stream_ply_or_error(
        space.editor_object_key or object_key_from_public_url(space.editor_splat_path),
        f"space-{space.id}-editor.ply",
    )


def _upload_ply_pair_or_error(file: UploadFile, original_prefix: str, editor_prefix: str):
    try:
        file.file.seek(0)
        source = file.file.read()
        editor_source = create_editor_cut_ply_bytes(source, cut_ratio=0.2)
        original_upload = upload_ply_bytes_to_r2(
            source,
            original_prefix,
            original_filename=file.filename,
        )
        editor_upload = upload_ply_bytes_to_r2(
            editor_source,
            editor_prefix,
            original_filename=file.filename,
        )
        return original_upload, editor_upload
    except (ValueError, PlyCutError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _delete_floor_dependents(db: Session, floor_ids: list[int]) -> None:
    if not floor_ids:
        return
    space_ids = [
        space_id
        for (space_id,) in db.query(Space.id).filter(Space.floor_id.in_(floor_ids)).all()
    ]
    if space_ids:
        db.query(SpaceNavigationGraph).filter(
            SpaceNavigationGraph.space_id.in_(space_ids)
        ).delete(synchronize_session=False)
    db.query(DoorSplat).filter(DoorSplat.floor_id.in_(floor_ids)).delete(
        synchronize_session=False
    )
    db.query(NavigationGraph).filter(NavigationGraph.floor_id.in_(floor_ids)).delete(
        synchronize_session=False
    )
    db.query(ProcessingJob).filter(ProcessingJob.floor_id.in_(floor_ids)).delete(
        synchronize_session=False
    )


def _stream_ply_or_error(object_key: str | None, filename: str):
    if not object_key:
        raise HTTPException(status_code=404, detail="PLY file is not linked")
    try:
        r2_object = get_ply_object_from_r2(object_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "public, max-age=3600",
    }
    if r2_object.content_length is not None:
        headers["Content-Length"] = str(r2_object.content_length)

    return StreamingResponse(
        _iter_r2_body(r2_object.body),
        media_type=r2_object.content_type,
        headers=headers,
    )


def _iter_r2_body(body):
    try:
        yield from body.iter_chunks(chunk_size=1024 * 1024)
    finally:
        body.close()
