import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || '';

const api = axios.create({ baseURL: API_BASE, timeout: 30000 });

export const fetchBuildings = () => api.get('/api/buildings').then(r => r.data);
export const createBuilding = (body) => api.post('/api/buildings', body).then(r => r.data);
export const fetchBuilding = (id) => api.get(`/api/buildings/${id}`).then(r => r.data);
export const updateBuilding = (id, body) => api.patch(`/api/buildings/${id}`, body).then(r => r.data);
export const deleteBuilding = (id) => api.delete(`/api/buildings/${id}`).then(r => r.data);

export const fetchFloors = (buildingId) => api.get('/api/floors', { params: { building_id: buildingId } }).then(r => r.data);
export const createFloor = (body) => api.post('/api/floors', body).then(r => r.data);
export const fetchFloor = (floorId) => api.get(`/api/floors/${floorId}`).then(r => r.data);
export const updateFloor = (floorId, body) => api.patch(`/api/floors/${floorId}`, body).then(r => r.data);
export const deleteFloor = (floorId) => api.delete(`/api/floors/${floorId}`).then(r => r.data);
export const uploadFloorPly = (floorId, file) => {
  const formData = new FormData();
  formData.append('ply_file', file);
  return api.post(`/api/floors/${floorId}/ply`, formData).then(r => r.data);
};

export const fetchSpaces = (floorId) => api.get('/api/spaces', { params: { floor_id: floorId } }).then(r => r.data);
export const createSpace = (body) => api.post('/api/spaces', body).then(r => r.data);
export const fetchSpace = (spaceId) => api.get(`/api/spaces/${spaceId}`).then(r => r.data);
export const updateSpace = (spaceId, body) => api.patch(`/api/spaces/${spaceId}`, body).then(r => r.data);
export const deleteSpace = (spaceId) => api.delete(`/api/spaces/${spaceId}`).then(r => r.data);
export const uploadSpacePly = (spaceId, file) => {
  const formData = new FormData();
  formData.append('ply_file', file);
  return api.post(`/api/spaces/${spaceId}/ply`, formData).then(r => r.data);
};

export const createProcessingJob = (formData) => api.post('/api/processing/jobs', formData).then(r => r.data);
export const fetchJobStatus = (jobId) => api.get(`/api/processing/jobs/${jobId}/status`).then(r => r.data);

export const fetchNavGraph = (floorId) => api.get(`/api/navigation/floors/${floorId}/graph`).then(r => r.data);
export const saveNavGraph = (floorId, nodes, edges) => api.put(`/api/navigation/floors/${floorId}/graph`, { nodes, edges }).then(r => r.data);
export const fetchNavPath = (floorId, from, to) => api.get(`/api/navigation/floors/${floorId}/path`, { params: { from, to } }).then(r => r.data);
export const fetchBuildingGraphs = (buildingId) => api.get(`/api/navigation/buildings/${buildingId}/graphs`).then(r => r.data);
export const fetchSpaceNavGraph = (spaceId) => api.get(`/api/navigation/spaces/${spaceId}/graph`).then(r => r.data);
export const saveSpaceNavGraph = (spaceId, nodes, edges) => api.put(`/api/navigation/spaces/${spaceId}/graph`, { nodes, edges }).then(r => r.data);
export const fetchSpaceNavPath = (spaceId, from, to) => api.get(`/api/navigation/spaces/${spaceId}/path`, { params: { from, to } }).then(r => r.data);

export default api;
