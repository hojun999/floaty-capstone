import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.building import Building, Floor, Space
from app.models.navigation import NavigationGraph, SpaceNavigationGraph
from app.schemas.navigation import (
    BuildingGraphsResponse,
    FloorGraphResponse,
    GraphPayload,
    PathResponse,
    SpaceGraphResponse,
    SpacePathResponse,
)
from app.services.pathfinding import find_path

router = APIRouter()


@router.put("/floors/{floor_id}/graph", response_model=FloorGraphResponse)
def save_floor_graph(
    floor_id: int,
    payload: GraphPayload,
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    graph = db.query(NavigationGraph).filter(NavigationGraph.floor_id == floor_id).first()
    data = payload.model_dump_json(by_alias=True)
    if graph:
        graph.data = data
    else:
        graph = NavigationGraph(floor_id=floor_id, data=data)
        db.add(graph)

    db.commit()
    db.refresh(graph)
    return _floor_graph_response(graph, floor)


@router.get("/floors/{floor_id}/graph", response_model=FloorGraphResponse)
def get_floor_graph(floor_id: int, db: Session = Depends(get_db)):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    graph = db.query(NavigationGraph).filter(NavigationGraph.floor_id == floor_id).first()
    if graph is None:
        return _empty_floor_graph_response(floor)
    return _floor_graph_response(graph, floor)


@router.put("/spaces/{space_id}/graph", response_model=SpaceGraphResponse)
def save_space_graph(
    space_id: int,
    payload: GraphPayload,
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    graph = (
        db.query(SpaceNavigationGraph)
        .filter(SpaceNavigationGraph.space_id == space_id)
        .first()
    )
    data = payload.model_dump_json(by_alias=True)
    if graph:
        graph.data = data
    else:
        graph = SpaceNavigationGraph(space_id=space_id, data=data)
        db.add(graph)

    db.commit()
    db.refresh(graph)
    return _space_graph_response(graph, space)


@router.get("/spaces/{space_id}/graph", response_model=SpaceGraphResponse)
def get_space_graph(space_id: int, db: Session = Depends(get_db)):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    graph = (
        db.query(SpaceNavigationGraph)
        .filter(SpaceNavigationGraph.space_id == space_id)
        .first()
    )
    if graph is None:
        return _empty_space_graph_response(space)
    return _space_graph_response(graph, space)


@router.get("/buildings/{building_id}/graphs", response_model=BuildingGraphsResponse)
def get_building_graphs(building_id: int, db: Session = Depends(get_db)):
    building = db.query(Building).filter(Building.id == building_id).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    floor_ids = [floor.id for floor in building.floors]
    graphs = []
    if floor_ids:
        graphs = (
            db.query(NavigationGraph)
            .filter(NavigationGraph.floor_id.in_(floor_ids))
            .all()
        )

    space_ids = [space.id for floor in building.floors for space in floor.spaces]
    space_graphs = []
    if space_ids:
        space_graphs = (
            db.query(SpaceNavigationGraph)
            .filter(SpaceNavigationGraph.space_id.in_(space_ids))
            .all()
        )

    graph_by_floor_id = {graph.floor_id: graph for graph in graphs}
    graph_by_space_id = {graph.space_id: graph for graph in space_graphs}
    return BuildingGraphsResponse(
        building_id=building_id,
        floors=[
            _floor_graph_response(graph_by_floor_id[floor.id], floor, graph_by_space_id)
            if floor.id in graph_by_floor_id
            else _empty_floor_graph_response(floor, graph_by_space_id)
            for floor in building.floors
        ],
    )


@router.get("/floors/{floor_id}/path", response_model=PathResponse)
def get_floor_path(
    floor_id: int,
    from_id: str = Query(..., alias="from"),
    to_id: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    floor = db.query(Floor).filter(Floor.id == floor_id).first()
    if not floor:
        raise HTTPException(status_code=404, detail="Floor not found")

    graph = db.query(NavigationGraph).filter(NavigationGraph.floor_id == floor_id).first()
    if graph is None:
        raise HTTPException(status_code=404, detail="Navigation graph not found")

    payload = _load_payload(graph)
    node_ids = {node.id for node in payload.nodes}
    if from_id not in node_ids:
        raise HTTPException(status_code=404, detail=f"Start node '{from_id}' not found")
    if to_id not in node_ids:
        raise HTTPException(status_code=404, detail=f"Destination node '{to_id}' not found")

    path = find_path(payload.nodes, payload.edges, from_id, to_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")
    return PathResponse(floor_id=floor_id, path=path)


@router.get("/spaces/{space_id}/path", response_model=SpacePathResponse)
def get_space_path(
    space_id: int,
    from_id: str = Query(..., alias="from"),
    to_id: str = Query(..., alias="to"),
    db: Session = Depends(get_db),
):
    space = db.query(Space).filter(Space.id == space_id).first()
    if not space:
        raise HTTPException(status_code=404, detail="Space not found")

    graph = (
        db.query(SpaceNavigationGraph)
        .filter(SpaceNavigationGraph.space_id == space_id)
        .first()
    )
    if graph is None:
        raise HTTPException(status_code=404, detail="Navigation graph not found")

    payload = _load_payload(graph)
    node_ids = {node.id for node in payload.nodes}
    if from_id not in node_ids:
        raise HTTPException(status_code=404, detail=f"Start node '{from_id}' not found")
    if to_id not in node_ids:
        raise HTTPException(status_code=404, detail=f"Destination node '{to_id}' not found")

    path = find_path(payload.nodes, payload.edges, from_id, to_id)
    if path is None:
        raise HTTPException(status_code=404, detail="Path not found")
    return SpacePathResponse(space_id=space_id, path=path)


def _floor_graph_response(
    graph: NavigationGraph,
    floor: Floor,
    graph_by_space_id: dict[int, SpaceNavigationGraph] | None = None,
) -> FloorGraphResponse:
    return FloorGraphResponse(
        floor_id=graph.floor_id,
        floor_number=floor.floor_number,
        floor_name=floor.floor_name,
        splat_path=floor.splat_path,
        graph=_load_payload(graph),
        spaces=_space_graph_responses(floor, graph_by_space_id or {}),
        updated_at=graph.updated_at,
    )


def _empty_floor_graph_response(
    floor: Floor,
    graph_by_space_id: dict[int, SpaceNavigationGraph] | None = None,
) -> FloorGraphResponse:
    return FloorGraphResponse(
        floor_id=floor.id,
        floor_number=floor.floor_number,
        floor_name=floor.floor_name,
        splat_path=floor.splat_path,
        graph=GraphPayload(nodes=[], edges=[]),
        spaces=_space_graph_responses(floor, graph_by_space_id or {}),
    )


def _space_graph_responses(
    floor: Floor,
    graph_by_space_id: dict[int, SpaceNavigationGraph],
) -> list[SpaceGraphResponse]:
    responses = []
    for space in floor.spaces:
        graph = graph_by_space_id.get(space.id)
        responses.append(
            _space_graph_response(graph, space)
            if graph
            else _empty_space_graph_response(space)
        )
    return responses


def _space_graph_response(
    graph: SpaceNavigationGraph,
    space: Space,
) -> SpaceGraphResponse:
    return SpaceGraphResponse(
        space_id=space.id,
        floor_id=space.floor_id,
        name=space.name,
        space_type=space.space_type,
        splat_path=space.splat_path,
        graph=_load_payload(graph),
        updated_at=graph.updated_at,
    )


def _empty_space_graph_response(space: Space) -> SpaceGraphResponse:
    return SpaceGraphResponse(
        space_id=space.id,
        floor_id=space.floor_id,
        name=space.name,
        space_type=space.space_type,
        splat_path=space.splat_path,
        graph=GraphPayload(nodes=[], edges=[]),
    )


def _load_payload(graph: NavigationGraph | SpaceNavigationGraph) -> GraphPayload:
    return GraphPayload.model_validate(_normalize_legacy_node_types(json.loads(graph.data)))


def _normalize_legacy_node_types(data: dict) -> dict:
    for node in data.get("nodes", []):
        if node.get("type") == "room":
            node["type"] = "door"
    return data
