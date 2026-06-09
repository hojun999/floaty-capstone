import http from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEditorCutPly } from './create-editor-cut-ply.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataPath = path.join(__dirname, 'local-api-data.json');
const publicDir = path.join(rootDir, 'public');
const port = Number(process.env.LOCAL_API_PORT || 8000);
const MODEL_FILE_NAME = 'model';
const EDITOR_MODEL_FILE_NAME = 'model_editor_cut';

const now = () => new Date().toISOString();

const defaultData = {
  buildings: [],
  floors: [],
  graphs: {},
  jobs: [],
  nextIds: {
    building: 1,
    floor: 1,
    job: 1,
  },
};

const unusedDefaultData = {
  buildings: [
    {
      id: 1,
      name: '세종관',
      address: '서울특별시 광진구 능동로 209',
      description: '로컬 개발용 건물',
      created_at: now(),
    },
  ],
  floors: [
    {
      id: 1,
      building_id: 1,
      floor_number: 1,
      floor_name: '1층',
      floor_plan_path: null,
      splat_path: '/models/buildings/1/floors/1/model',
      status: 'completed',
      created_at: now(),
    },
  ],
  graphs: {},
  jobs: [],
  nextIds: {
    building: 2,
    floor: 2,
    job: 1,
  },
};

async function ensureDir(target) {
  await mkdir(target, { recursive: true });
}

async function ensureModelDir(buildingId, floorId) {
  await ensureDir(path.join(publicDir, 'models', 'buildings', String(buildingId), 'floors', String(floorId)));
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function getFileInfo(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

function getFloorModelDir(buildingId, floorId) {
  return path.join(publicDir, 'models', 'buildings', String(buildingId), 'floors', String(floorId));
}

async function ensureEditorCutModel(buildingId, floorId) {
  const modelDir = getFloorModelDir(buildingId, floorId);
  const candidates = [
    {
      input: path.join(modelDir, MODEL_FILE_NAME),
      output: path.join(modelDir, EDITOR_MODEL_FILE_NAME),
    },
    {
      input: path.join(modelDir, `${MODEL_FILE_NAME}.ply`),
      output: path.join(modelDir, `${EDITOR_MODEL_FILE_NAME}.ply`),
    },
  ];

  for (const candidate of candidates) {
    const inputInfo = await getFileInfo(candidate.input);
    if (!inputInfo) continue;
    const outputInfo = await getFileInfo(candidate.output);
    if (outputInfo && outputInfo.mtimeMs >= inputInfo.mtimeMs) return candidate.output;
    await createEditorCutPly({
      input: candidate.input,
      output: candidate.output,
      cutY: null,
      cutRatio: 0.2,
      rotationXDeg: -90,
    });
    return candidate.output;
  }

  return null;
}

function publicModelUrlFromPath(filePath) {
  if (!filePath) return null;
  const relative = path.relative(publicDir, filePath).replace(/\\/g, '/');
  return `/${relative}`;
}

async function refreshFloorEditorModel(floor) {
  if (!floor?.building_id || !floor?.id) return floor;
  const editorPath = await ensureEditorCutModel(floor.building_id, floor.id);
  floor.editor_splat_path = publicModelUrlFromPath(editorPath);
  floor.editor_object_key = floor.editor_splat_path;
  return floor;
}

async function loadData() {
  try {
    return JSON.parse(await readFile(dataPath, 'utf8'));
  } catch {
    await ensureModelDir(1, 1);
    await saveData(defaultData);
    return structuredClone(defaultData);
  }
}

async function saveData(data) {
  await ensureDir(path.dirname(dataPath));
  await writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
}

function sendNoContent(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function pointDistance(a, b) {
  const dx = Number(a.x) - Number(b.x);
  const dy = Number(a.y) - Number(b.y);
  const dz = Number(a.z) - Number(b.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function findPath(graph, from, to) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  if (!from || !to) return [];
  const byId = Object.fromEntries(nodes.map(node => [node.id, node]));
  const adjacency = Object.fromEntries(nodes.map(node => [node.id, []]));
  for (const edge of edges) {
    adjacency[edge.from]?.push(edge.to);
    adjacency[edge.to]?.push(edge.from);
  }
  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const pathIds = queue.shift();
    const current = pathIds[pathIds.length - 1];
    if (current === to) return pathIds.map(id => byId[id]).filter(Boolean);
    for (const next of adjacency[current] || []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push([...pathIds, next]);
    }
  }
  return [];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendNoContent(res);

  const data = await loadData();
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);
  const parts = url.pathname.split('/').filter(Boolean);

  try {
    if (parts[0] !== 'api') return sendJson(res, 404, { detail: 'Not found' });

    if (parts[1] === 'buildings') {
      if (req.method === 'GET' && parts.length === 2) return sendJson(res, 200, data.buildings);
      if (req.method === 'POST' && parts.length === 2) {
        const body = await readBody(req);
        const building = {
          id: data.nextIds.building++,
          name: String(body.name || '').trim(),
          address: body.address || null,
          description: body.description || null,
          created_at: now(),
        };
        if (!building.name) return sendJson(res, 400, { detail: 'name is required' });
        data.buildings.push(building);
        await saveData(data);
        return sendJson(res, 200, building);
      }

      const buildingId = Number(parts[2]);
      const building = data.buildings.find(item => item.id === buildingId);
      if (!building) return sendJson(res, 404, { detail: 'Building not found' });
      if (req.method === 'GET') return sendJson(res, 200, building);
      if (req.method === 'PATCH') {
        Object.assign(building, await readBody(req));
        await saveData(data);
        return sendJson(res, 200, building);
      }
      if (req.method === 'DELETE') {
        data.buildings = data.buildings.filter(item => item.id !== buildingId);
        data.floors = data.floors.filter(item => item.building_id !== buildingId);
        for (const key of Object.keys(data.graphs)) {
          const floor = data.floors.find(item => String(item.id) === key);
          if (!floor) delete data.graphs[key];
        }
        await saveData(data);
        return sendJson(res, 200, { detail: 'Deleted' });
      }
    }

    if (parts[1] === 'floors') {
      if (req.method === 'GET' && parts.length === 2) {
        const buildingId = Number(url.searchParams.get('building_id'));
        const floors = buildingId ? data.floors.filter(floor => floor.building_id === buildingId) : data.floors;
        return sendJson(res, 200, floors);
      }
      if (req.method === 'POST' && parts.length === 2) {
        const body = await readBody(req);
        const floor = {
          id: data.nextIds.floor++,
          building_id: Number(body.building_id),
          floor_number: Number(body.floor_number),
          floor_name: body.floor_name || `${body.floor_number}층`,
          floor_plan_path: body.floor_plan_path || null,
          splat_path: null,
          editor_splat_path: null,
          editor_object_key: null,
          status: body.status || 'queued',
          created_at: now(),
        };
        floor.splat_path = `/models/buildings/${floor.building_id}/floors/${floor.id}/model`;
        floor.editor_splat_path = `/models/buildings/${floor.building_id}/floors/${floor.id}/model_editor_cut`;
        floor.editor_object_key = floor.editor_splat_path;
        data.floors.push(floor);
        data.graphs[floor.id] = { nodes: [], edges: [] };
        await ensureModelDir(floor.building_id, floor.id);
        await saveData(data);
        return sendJson(res, 200, floor);
      }

      const floorId = Number(parts[2]);
      const floor = data.floors.find(item => item.id === floorId);
      if (!floor) return sendJson(res, 404, { detail: 'Floor not found' });
      if (req.method === 'GET') {
        await ensureModelDir(floor.building_id, floor.id);
        await refreshFloorEditorModel(floor).catch((error) => {
          console.warn(`Could not create editor cut model for floor ${floor.id}: ${error.message}`);
        });
        await saveData(data);
        return sendJson(res, 200, floor);
      }
      if (req.method === 'PATCH') {
        Object.assign(floor, await readBody(req));
        if (!floor.splat_path) floor.splat_path = `/models/buildings/${floor.building_id}/floors/${floor.id}/model`;
        await ensureModelDir(floor.building_id, floor.id);
        await refreshFloorEditorModel(floor).catch((error) => {
          console.warn(`Could not create editor cut model for floor ${floor.id}: ${error.message}`);
        });
        await saveData(data);
        return sendJson(res, 200, floor);
      }
      if (req.method === 'DELETE') {
        data.floors = data.floors.filter(item => item.id !== floorId);
        delete data.graphs[floorId];
        await saveData(data);
        return sendJson(res, 200, { detail: 'Deleted' });
      }
    }

    if (parts[1] === 'navigation' && parts[2] === 'floors') {
      const floorId = Number(parts[3]);
      if (parts[4] === 'graph') {
        if (req.method === 'GET') return sendJson(res, 200, { graph: data.graphs[floorId] || { nodes: [], edges: [] } });
        if (req.method === 'PUT') {
          const body = await readBody(req);
          data.graphs[floorId] = {
            nodes: body.nodes || body.graph?.nodes || [],
            edges: body.edges || body.graph?.edges || [],
          };
          await saveData(data);
          return sendJson(res, 200, { graph: data.graphs[floorId] });
        }
      }
      if (parts[4] === 'path' && req.method === 'GET') {
        const graph = data.graphs[floorId] || { nodes: [], edges: [] };
        const path = findPath(graph, url.searchParams.get('from'), url.searchParams.get('to'));
        const distance = path.slice(1).reduce((sum, node, index) => sum + pointDistance(path[index], node), 0);
        return sendJson(res, 200, { path, distance, estimated_time: Math.round(distance / 1.2) });
      }
    }

    if (parts[1] === 'navigation' && parts[2] === 'buildings' && parts[4] === 'graphs') {
      const buildingId = Number(parts[3]);
      const floors = data.floors.filter(floor => floor.building_id === buildingId);
      const graphs = floors.map(floor => ({ floor_id: floor.id, graph: data.graphs[floor.id] || { nodes: [], edges: [] } }));
      return sendJson(res, 200, graphs);
    }

    if (parts[1] === 'processing' && parts[2] === 'jobs') {
      if (req.method === 'POST' && parts.length === 3) {
        const job = { id: data.nextIds.job++, status: 'processing', progress: 0, created_at: now() };
        data.jobs.push(job);
        await saveData(data);
        return sendJson(res, 200, job);
      }
      const jobId = Number(parts[3]);
      const job = data.jobs.find(item => item.id === jobId);
      if (job && parts[4] === 'status') return sendJson(res, 200, job);
    }

    return sendJson(res, 404, { detail: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { detail: error.message || 'Internal server error' });
  }
});

server.listen(port, async () => {
  await ensureModelDir(1, 1);
  console.log(`Local API server listening on http://localhost:${port}`);
  console.log('Model path example: public/models/buildings/1/floors/1/model');
});
