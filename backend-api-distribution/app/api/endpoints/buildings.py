from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.building import Building, Floor, Space
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
from app.services.r2_storage import upload_ply_to_r2

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

    upload = _upload_ply_or_error(
        ply_file,
        f"buildings/{floor.building_id}/floors/{floor.id}",
    )
    floor.splat_path = upload.url
    floor.status = "completed"
    db.commit()
    db.refresh(floor)
    return floor


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

    upload = _upload_ply_or_error(
        ply_file,
        f"buildings/{floor.building_id}/floors/{floor.id}/spaces/{space.id}",
    )
    space.splat_path = upload.url
    space.object_key = upload.object_key
    space.original_filename = upload.original_filename
    space.status = "completed"
    db.commit()
    db.refresh(space)
    return space


def _upload_ply_or_error(file: UploadFile, prefix: str):
    try:
        return upload_ply_to_r2(file, prefix)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
