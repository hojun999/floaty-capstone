Local rendering models live here.

Use backend ids, not names:

public/models/buildings/{buildingId}/floors/{floorId}/model

Example:

public/models/buildings/1/floors/1/model

The local API server creates the building/floor folders when a floor is registered.
Place the converted 3DGS PLY file in that folder as `model`.

The graph editor uses `model_editor_cut`, generated automatically from `model`
with `--cut-ratio 0.1` when the local API server reads or updates the floor.
