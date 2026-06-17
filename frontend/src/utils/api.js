import axios from 'axios';

const DEFAULT_API_BASE = 'https://port-0-floaty-capstone-free-mq4vuon6474fb398.sel3.cloudtype.app';
const normalizeApiBase = (value) => String(value || '').replace(/\/+$/, '');

export const API_BASE = normalizeApiBase(
  import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE,
);

const api = axios.create({ baseURL: API_BASE, timeout: 30000 });
const PLY_UPLOAD_TIMEOUT_MS = 600000;

export const describeApiError = (error, fallback = 'Request failed.') => {
  const method = error?.config?.method?.toUpperCase?.() || 'REQUEST';
  const url = `${error?.config?.baseURL || ''}${error?.config?.url || ''}` || 'unknown URL';
  if (error?.response) {
    const detail = error.response.data?.detail || error.response.statusText || fallback;
    return `${fallback} (${method} ${url} -> ${error.response.status}: ${detail})`;
  }
  if (error?.request) {
    return `${fallback} (${method} ${url} -> no response. Check API URL/CORS/network.)`;
  }
  return `${fallback} (${error?.message || 'unknown error'})`;
};

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
export const uploadFloorPlyViaApi = (floorId, file) => {
  const formData = new FormData();
  formData.append('ply_file', file);
  return api.post(`/api/floors/${floorId}/ply`, formData, { timeout: PLY_UPLOAD_TIMEOUT_MS }).then(r => r.data);
};
export const prepareFloorPlyUpload = (floorId, filename) => (
  api.post(`/api/floors/${floorId}/ply-upload`, { filename }).then(r => r.data)
);
export const completeFloorPlyUpload = (floorId, body) => (
  api.post(`/api/floors/${floorId}/ply-upload/complete`, body).then(r => r.data)
);

export const fetchSpaces = (floorId) => api.get('/api/spaces', { params: { floor_id: floorId } }).then(r => r.data);
export const createSpace = (body) => api.post('/api/spaces', body).then(r => r.data);
export const fetchSpace = (spaceId) => api.get(`/api/spaces/${spaceId}`).then(r => r.data);
export const updateSpace = (spaceId, body) => api.patch(`/api/spaces/${spaceId}`, body).then(r => r.data);
export const deleteSpace = (spaceId) => api.delete(`/api/spaces/${spaceId}`).then(r => r.data);
export const uploadSpacePlyViaApi = (spaceId, file) => {
  const formData = new FormData();
  formData.append('ply_file', file);
  return api.post(`/api/spaces/${spaceId}/ply`, formData, { timeout: PLY_UPLOAD_TIMEOUT_MS }).then(r => r.data);
};
export const prepareSpacePlyUpload = (spaceId, filename) => (
  api.post(`/api/spaces/${spaceId}/ply-upload`, { filename }).then(r => r.data)
);
export const completeSpacePlyUpload = (spaceId, body) => (
  api.post(`/api/spaces/${spaceId}/ply-upload/complete`, body).then(r => r.data)
);

const uploadPlyDirectToR2 = async (upload, file) => {
  const response = await fetch(upload.upload_url, {
    method: upload.method || 'PUT',
    headers: {
      'Content-Type': upload.content_type || 'application/octet-stream',
    },
    body: file,
  });
  if (!response.ok) {
    throw new Error(`R2 upload failed (${response.status} ${response.statusText})`);
  }
};

export const uploadFloorPly = async (floorId, file) => {
  const upload = await prepareFloorPlyUpload(floorId, file.name);
  await uploadPlyDirectToR2(upload, file);
  return completeFloorPlyUpload(floorId, {
    object_key: upload.object_key,
    url: upload.url,
    original_filename: file.name,
  });
};

export const uploadSpacePly = async (spaceId, file) => {
  const upload = await prepareSpacePlyUpload(spaceId, file.name);
  await uploadPlyDirectToR2(upload, file);
  return completeSpacePlyUpload(spaceId, {
    object_key: upload.object_key,
    url: upload.url,
    original_filename: file.name,
  });
};

export const floorPlyFileUrl = (floorId) => `${API_BASE}/api/floors/${floorId}/ply-file`;
export const spacePlyFileUrl = (spaceId) => `${API_BASE}/api/spaces/${spaceId}/ply-file`;
export const floorEditorPlyFileUrl = (floorId) => `${API_BASE}/api/floors/${floorId}/editor-ply-file`;
export const spaceEditorPlyFileUrl = (spaceId) => `${API_BASE}/api/spaces/${spaceId}/editor-ply-file`;

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
