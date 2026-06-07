import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || '';

const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

// ─── Buildings ────────────────────────────────────────────────────────────────
export const fetchBuildings = () =>
  api.get('/api/buildings').then(r => r.data);

export const createBuilding = (body) =>
  api.post('/api/buildings', body).then(r => r.data);

export const fetchBuilding = (id) =>
  api.get(`/api/buildings/${id}`).then(r => r.data);

export const updateBuilding = (id, body) =>
  api.patch(`/api/buildings/${id}`, body).then(r => r.data);

export const deleteBuilding = (id) =>
  api.delete(`/api/buildings/${id}`).then(r => r.data);

// ─── Floors ───────────────────────────────────────────────────────────────────
export const fetchFloors = (buildingId) =>
  api.get('/api/floors', { params: { building_id: buildingId } }).then(r => r.data);

export const createFloor = (body) =>
  api.post('/api/floors', body).then(r => r.data);

export const fetchFloor = (floorId) =>
  api.get(`/api/floors/${floorId}`).then(r => r.data);

export const updateFloor = (floorId, body) =>
  api.patch(`/api/floors/${floorId}`, body).then(r => r.data);

export const deleteFloor = (floorId) =>
  api.delete(`/api/floors/${floorId}`).then(r => r.data);

// ─── Processing Jobs ──────────────────────────────────────────────────────────
// formData: FormData with building_name, floor_number, video_file, [address, description, floor_name, settings]
export const createProcessingJob = (formData) =>
  api.post('/api/processing/jobs', formData).then(r => r.data);

export const fetchJobStatus = (jobId) =>
  api.get(`/api/processing/jobs/${jobId}/status`).then(r => r.data);

// ─── Navigation ───────────────────────────────────────────────────────────────
export const fetchNavGraph = (floorId) =>
  api.get(`/api/navigation/floors/${floorId}/graph`).then(r => r.data);

// body: { nodes: [...], edges: [...] }
export const saveNavGraph = (floorId, nodes, edges) =>
  api.put(`/api/navigation/floors/${floorId}/graph`, { nodes, edges }).then(r => r.data);

// from/to: node id strings
export const fetchNavPath = (floorId, from, to) =>
  api.get(`/api/navigation/floors/${floorId}/path`, { params: { from, to } }).then(r => r.data);

export const fetchBuildingGraphs = (buildingId) =>
  api.get(`/api/navigation/buildings/${buildingId}/graphs`).then(r => r.data);

export default api;
