import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { MODEL_ROTATION_X, SPLAT_MODEL_TRANSFORM } from '../renderers/modelTransforms.js';
import { createSplatRenderer } from '../renderers/SplatModelRenderer.js';
import {
  API_BASE,
  fetchSpaces,
  floorEditorPlyFileUrl,
  floorPlyFileUrl,
  spaceEditorPlyFileUrl,
  spacePlyFileUrl,
} from '../utils/api.js';

const API = API_BASE;
const EDITOR_MOVE_SPEED_FACTOR = 0.006;
const EDITOR_MIN_MOVE_SPEED = 0.002;
const EDITOR_MAX_MOVE_SPEED = 0.06;
const EDITOR_NODE_SCALE_FACTOR = 0.015;
const EDITOR_MIN_NODE_SCALE = 0.03;
const EDITOR_MAX_NODE_SCALE = 0.3;
const EDITOR_GROUND_CENTER_OFFSET_RATIO = 0.1;
const DEFAULT_MODEL_URL = '/Open3d2.ply';
const EDITOR_VIEW_BACKGROUND = 0x3f4247;
const EDITOR_GRID_MAJOR = 0x8a8d91;
const EDITOR_GRID_MINOR = 0x707378;
const EDITOR_AXIS_X = 0x9a9a9a;
const EDITOR_AXIS_Z = 0x767676;
const EDITOR_GRID_SIZE = 100;
const EDITOR_GRID_DIVISIONS = 100;
const EDITOR_GRID_BOUND_PADDING = 0.35;

const getTargetPlyFileUrl = (targetType, targetId) => {
  if (!targetId) return null;
  return targetType === 'space'
    ? spacePlyFileUrl(targetId)
    : floorPlyFileUrl(targetId);
};

const getTargetEditorPlyFileUrl = (targetType, targetId) => {
  if (!targetId) return null;
  return targetType === 'space'
    ? spaceEditorPlyFileUrl(targetId)
    : floorEditorPlyFileUrl(targetId);
};

// ─── 상수 ────────────────────────────────────────────────────────────────────
const NODE_TYPES = {
  start:       { label: '출발점',         hex: '#22c55e', color: 0x22c55e, colorSel: 0x86efac },
  destination: { label: '목적지 (길찾기)', hex: '#ef4444', color: 0xef4444, colorSel: 0xfca5a5 },
  waypoint:    { label: '경유점',          hex: '#f97316', color: 0xf97316, colorSel: 0xfdba74 },
  door:        { label: '문 (방 전환)',    hex: '#3b82f6', color: 0x3b82f6, colorSel: 0x93c5fd },
};

let _nSeq = 0;
let _eSeq = 0;
const mkNodeId = () => `node_${++_nSeq}`;
const mkEdgeId = () => `edge_${++_eSeq}`;

const getEditorCutModelUrl = (modelUrl) => {
  if (!modelUrl) return modelUrl;
  const queryIndex = modelUrl.search(/[?#]/);
  const base = queryIndex === -1 ? modelUrl : modelUrl.slice(0, queryIndex);
  const suffix = queryIndex === -1 ? '' : modelUrl.slice(queryIndex);
  if (/\.ply$/i.test(base)) return base.replace(/(\.ply)$/i, '_editor_cut$1') + suffix;
  return `${base}_editor_cut${suffix}`;
};

const sanitizeFloorFolderName = (name) => (
  String(name || '')
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '-')
    .replace(/\s+/g, ' ')
);

const getLocalFloorModelUrls = (floor) => {
  if (!floor?.building_id || !floor?.id) return [];
  const base = `/models/buildings/${floor.building_id}/floors/${floor.id}`;
  return [`${base}/model`, `${base}/model.ply`];
};

const getLocalFloorEditorModelUrls = (floor) => (
  getLocalFloorModelUrls(floor).map(getEditorCutModelUrl)
);

const isUsableModelResponse = (response) => {
  if (!response.ok) return false;
  const contentType = response.headers.get('content-type') || '';
  return !contentType.toLowerCase().includes('text/html');
};

const pickFirstExistingUrl = async (urls) => {
  const candidates = urls.filter(Boolean);
  for (const url of candidates) {
    if (url === DEFAULT_MODEL_URL) return url;
    if (/^https?:\/\//i.test(url)) return url;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (isUsableModelResponse(response)) return url;
    } catch {}
  }
  return DEFAULT_MODEL_URL;
};

// ─── 기즈모 화살표 메시 생성 ─────────────────────────────────────────────────
function makeArrow(color) {
  const mat   = new THREE.MeshBasicMaterial({ color, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 8), mat.clone());
  shaft.position.y = 0.7;
  shaft.renderOrder = 10;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 8), mat.clone());
  head.position.y = 1.625;
  head.renderOrder = 10;
  const group = new THREE.Group();
  group.add(shaft, head);
  return { group, shaft, head };
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
export default function NavGraphEditor({ onExit, floorId, floorLabel, onSaveGraph, targetType = 'floor', targetId }) {
  const graphTargetType = targetType || 'floor';
  const graphTargetId = targetId ?? floorId;
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);
  const addModeRef = useRef(false);
  const selIdRef   = useRef(null);

  const [nodes,      setNodes]      = useState([]);
  const [edges,      setEdges]      = useState([]);
  const [selId,      setSelId]      = useState(null);
  const [addMode,    setAddMode]    = useState(false);
  const [form,       setForm]       = useState({ name: '', type: 'waypoint', x: 0, y: 0, z: 0, target_space_id: '' });
  const [spaces,     setSpaces]     = useState([]);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [showGrid, setShowGrid] = useState(true);
  const [modelLoadStatus, setModelLoadStatus] = useState('loading');

  const showGridRef = useRef(true);

  useEffect(() => {
    if (graphTargetType !== 'floor' || !graphTargetId) {
      setSpaces([]);
      return;
    }
    fetchSpaces(graphTargetId)
      .then(setSpaces)
      .catch(() => setSpaces([]));
  }, [graphTargetType, graphTargetId]);

  // ─── Three.js 초기화 ─────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ─ Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    // false: CSS가 캔버스 표시 크기를 담당 (픽셀 버퍼만 설정)
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    mount.appendChild(renderer.domElement);

    // ─ Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(EDITOR_VIEW_BACKGROUND);

    // ─ Camera — Y-up (PLY 좌표계 기준) ──────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 15, 10);

    // ─ Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // ─ Grid (XZ 평면, Y-up 기준 바닥) ────────────────────────────────────
    const grid = new THREE.Group();
    scene.add(grid);

    // ─ OrbitControls — 레퍼런스와 완전히 동일한 설정 ───────────────────
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping    = true;
    orbit.dampingFactor    = 0.1;       // 기본 0.05보다 빠른 응답감
    orbit.screenSpacePanning = true;
    orbit.rotateSpeed      = 0.5;
    orbit.minPolarAngle    = 0.05;
    orbit.maxPolarAngle    = Math.PI - 0.05;
    orbit.mouseButtons     = {
      LEFT:   THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.PAN,
    };
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    orbit.update();

    // ─ 바닥 평면 (XZ at y=0, Y-up) ──────────────────────────────────────
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster   = new THREE.Raycaster();

    // ─ 기즈모 (Unity 스타일 축 이동 핸들) ───────────────────────────────
    // Y-up: 수평 이동 축은 X(빨강)와 Z(파랑)
    const xArr = makeArrow(EDITOR_AXIS_X);
    xArr.group.rotation.z = -Math.PI / 2;   // Y→X 방향
    xArr.shaft.userData.gizmoAxis = 'x';
    xArr.head.userData.gizmoAxis  = 'x';

    const zArr = makeArrow(EDITOR_AXIS_Z);   // Y-up에서 Z는 수평축
    zArr.group.rotation.x = Math.PI / 2;    // Y→Z 방향
    zArr.shaft.userData.gizmoAxis = 'z';
    zArr.head.userData.gizmoAxis  = 'z';

    const gizmo = new THREE.Group();
    gizmo.add(xArr.group, zArr.group);
    gizmo.visible = false;
    scene.add(gizmo);

    const gizmoMeshes = [xArr.shaft, xArr.head, zArr.shaft, zArr.head];

    // ─ 내부 상태 ─────────────────────────────────────────────────────────
    const s = {
      scene, camera, renderer, orbit, raycaster, groundPlane,
      grid, gizmo, gizmoMeshes,
      meshes:  [],
      lines:   [],
      gNodes:  [],
      gEdges:  [],
      downPos: null,
      drag: null,
      splatRenderer: createSplatRenderer({ renderer, camera, scene }),
      modelMesh: null,
      nodeScale: 1.0,  // PLY 로드 후 바운딩 박스 기준으로 갱신
    };
    threeRef.current = s;

    // ─ 헬퍼 함수 ─────────────────────────────────────────────────────────
    const canvas = renderer.domElement;

    const disposeGrid = () => {
      grid.children.forEach((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
      grid.clear();
    };

    const addGridSegments = (segments, color) => {
      if (!segments.length) return;
      const geometry = new THREE.BufferGeometry().setFromPoints(segments);
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.78,
        depthTest: true,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(geometry, material);
      grid.add(lines);
    };

    const pushSegment = (segments, x1, z1, x2, z2) => {
      if (Math.abs(x1 - x2) < 1e-6 && Math.abs(z1 - z2) < 1e-6) return;
      segments.push(new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x2, 0, z2));
    };

    const rebuildGrid = (bounds = null) => {
      disposeGrid();
      const half = EDITOR_GRID_SIZE / 2;
      const step = EDITOR_GRID_SIZE / EDITOR_GRID_DIVISIONS;
      const majorSegments = [];
      const minorSegments = [];
      const blocked = bounds ? {
        minX: Math.max(-half, bounds.min.x - EDITOR_GRID_BOUND_PADDING),
        maxX: Math.min(half, bounds.max.x + EDITOR_GRID_BOUND_PADDING),
        minZ: Math.max(-half, bounds.min.z - EDITOR_GRID_BOUND_PADDING),
        maxZ: Math.min(half, bounds.max.z + EDITOR_GRID_BOUND_PADDING),
      } : null;

      for (let i = 0; i <= EDITOR_GRID_DIVISIONS; i += 1) {
        const value = -half + i * step;
        const segments = i % 10 === 0 ? majorSegments : minorSegments;

        if (blocked && value >= blocked.minZ && value <= blocked.maxZ) {
          pushSegment(segments, -half, value, blocked.minX, value);
          pushSegment(segments, blocked.maxX, value, half, value);
        } else {
          pushSegment(segments, -half, value, half, value);
        }

        if (blocked && value >= blocked.minX && value <= blocked.maxX) {
          pushSegment(segments, value, -half, value, blocked.minZ);
          pushSegment(segments, value, blocked.maxZ, value, half);
        } else {
          pushSegment(segments, value, -half, value, half);
        }
      }

      addGridSegments(minorSegments, EDITOR_GRID_MINOR);
      addGridSegments(majorSegments, EDITOR_GRID_MAJOR);
      grid.visible = showGridRef.current;
    };

    rebuildGrid();

    const toNDC = (e) => {
      const r = canvas.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - r.left) / r.width)  * 2 - 1,
        -((e.clientY - r.top)  / r.height) * 2 + 1,
      );
    };

    const hitNode = (ndc) => {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(s.meshes);
      return hits.length ? hits[0].object.userData.nodeId : null;
    };

    const hitGizmo = (ndc) => {
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(gizmoMeshes);
      return hits.length ? hits[0].object.userData.gizmoAxis : null;
    };

    const hitPlane = (ndc, plane) => {
      raycaster.setFromCamera(ndc, camera);
      const pt = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, pt) ? pt : null;
    };

    const applyNodeColor = (nodeId, isSelected) => {
      const mesh = s.meshes.find(m => m.userData.nodeId === nodeId);
      const node = s.gNodes.find(n => n.id === nodeId);
      if (!mesh || !node) return;
      const meta = NODE_TYPES[node.type] || NODE_TYPES.waypoint;
      mesh.material.color.setHex(isSelected ? meta.colorSel : meta.color);
      mesh.scale.setScalar(s.nodeScale * (isSelected ? 1.4 : 1.0));
    };

    const selectNode = (id) => {
      if (selIdRef.current) applyNodeColor(selIdRef.current, false);
      selIdRef.current = id;
      setSelId(id);
      if (id) {
        applyNodeColor(id, true);
        const node = s.gNodes.find(n => n.id === id);
        if (node) {
          setForm({
            name: node.name,
            type: node.type,
            x: node.x,
            y: node.y,
            z: node.z,
            target_space_id: node.target_space_id || '',
          });
          gizmo.position.set(node.x, node.y, node.z);
          gizmo.visible = true;
        }
      } else {
        gizmo.visible = false;
      }
    };

    const addNodeMesh = (node) => {
      const meta = NODE_TYPES[node.type] || NODE_TYPES.waypoint;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 16, 16),
        new THREE.MeshStandardMaterial({ color: meta.color }),
      );
      mesh.position.set(node.x, node.y, node.z);
      mesh.scale.setScalar(s.nodeScale);
      mesh.userData.nodeId = node.id;
      scene.add(mesh);
      s.meshes.push(mesh);
    };

    const removeNodeMesh = (nodeId) => {
      const i = s.meshes.findIndex(m => m.userData.nodeId === nodeId);
      if (i === -1) return;
      const [mesh] = s.meshes.splice(i, 1);
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      if (nodeId === selIdRef.current) gizmo.visible = false;
    };

    const addEdgeLine = (edge) => {
      const a = s.gNodes.find(n => n.id === edge.from);
      const b = s.gNodes.find(n => n.id === edge.to);
      if (!a || !b) return;
      const geo  = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y, a.z),
        new THREE.Vector3(b.x, b.y, b.z),
      ]);
      const mat  = new THREE.LineBasicMaterial({ color: 0xaaaacc, opacity: 0.7, transparent: true });
      const line = new THREE.Line(geo, mat);
      line.userData.edgeId = edge.id;
      scene.add(line);
      s.lines.push(line);
    };

    const removeEdgeLine = (edgeId) => {
      const i = s.lines.findIndex(l => l.userData.edgeId === edgeId);
      if (i === -1) return;
      const [line] = s.lines.splice(i, 1);
      scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    };

    const rebuildEdges = (nodeId) => {
      s.gEdges
        .filter(e => e.from === nodeId || e.to === nodeId)
        .forEach(e => {
          const line = s.lines.find(l => l.userData.edgeId === e.id);
          const a = s.gNodes.find(n => n.id === e.from);
          const b = s.gNodes.find(n => n.id === e.to);
          if (!line || !a || !b) return;
          const pos = line.geometry.attributes.position;
          pos.setXYZ(0, a.x, a.y, a.z);
          pos.setXYZ(1, b.x, b.y, b.z);
          pos.needsUpdate = true;
        });
    };

    s.addNodeMesh    = addNodeMesh;
    s.removeNodeMesh = removeNodeMesh;
    s.addEdgeLine    = addEdgeLine;
    s.removeEdgeLine = removeEdgeLine;
    s.rebuildEdges   = rebuildEdges;
    s.selectNode     = selectNode;

    // ─ 포인터 이벤트 ─────────────────────────────────────────────────────

    canvas.addEventListener('pointerdown', (e) => {
      s.downPos = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return;

      const ndc = toNDC(e);

      // 1순위: 기즈모 화살표 — 축 이동 드래그
      if (gizmo.visible) {
        const axis = hitGizmo(ndc);
        if (axis) {
          const node = s.gNodes.find(n => n.id === selIdRef.current);
          if (node) {
            const nodePos = new THREE.Vector3(node.x, node.y, node.z);
            const axisVec = axis === 'x'
              ? new THREE.Vector3(1, 0, 0)
              : new THREE.Vector3(0, 0, 1);  // Y-up: Z가 수평축

            // 화면 공간에서 축 방향을 NDC로 투영 — 레이-평면 교차 대신 사용
            // 마우스가 축과 수직으로 이동해도 교차점이 발산하지 않음
            const ndcNode    = nodePos.clone().project(camera);
            const ndcAxisTip = nodePos.clone().add(axisVec).project(camera);
            const screenDir  = new THREE.Vector2(ndcAxisTip.x - ndcNode.x, ndcAxisTip.y - ndcNode.y);
            const ndcPerUnit = screenDir.length();   // NDC 1단위 = 월드 몇 단위
            if (ndcPerUnit < 1e-6) return;           // 축이 카메라 정면이면 스킵
            screenDir.normalize();

            s.drag = { type: 'axis', nodeId: node.id, axis, axisVec, nodeStartPos: nodePos.clone(), screenDir, ndcPerUnit, startNDC: ndc.clone() };
            orbit.enabled = false;
            canvas.setPointerCapture(e.pointerId);
            e.stopPropagation();
            return;
          }
        }
      }

      // 2순위: 선택된 노드 구체 — XZ 자유 드래그 (Y-up 수평)
      const nodeId = hitNode(ndc);
      if (nodeId && nodeId === selIdRef.current) {
        const node = s.gNodes.find(n => n.id === nodeId);
        if (!node) return;
        // Y-up: 수평 평면은 XZ at y=node.y
        const freePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -node.y);
        const initialPt = new THREE.Vector3();
        raycaster.setFromCamera(ndc, camera);
        if (!raycaster.ray.intersectPlane(freePlane, initialPt)) return;
        s.drag = {
          type: 'free', nodeId, dragPlane: freePlane,
          nodeStartX: node.x, nodeStartZ: node.z, initialPt: initialPt.clone(),
        };
        orbit.enabled = false;
        canvas.setPointerCapture(e.pointerId);
        e.stopPropagation();
      }
    }, { capture: true });

    canvas.addEventListener('pointermove', (e) => {
      if (!s.drag) return;
      const ndc = toNDC(e);

      if (s.drag.type === 'axis') {
        // 마우스 NDC 이동량을 화면 축 방향으로 투영 → 월드 이동량 계산
        const mouseDelta = new THREE.Vector2(ndc.x - s.drag.startNDC.x, ndc.y - s.drag.startNDC.y);
        const worldDelta = mouseDelta.dot(s.drag.screenDir) / s.drag.ndcPerUnit;
        const newPos     = s.drag.nodeStartPos.clone().addScaledVector(s.drag.axisVec, worldDelta);

        const node = s.gNodes.find(n => n.id === s.drag.nodeId);
        if (!node) return;
        if (s.drag.axis === 'x') node.x = newPos.x;
        else                     node.z = newPos.z;

        const mesh = s.meshes.find(m => m.userData.nodeId === node.id);
        if (mesh) mesh.position.set(node.x, node.y, node.z);
        gizmo.position.set(node.x, node.y, node.z);
        rebuildEdges(node.id);

      } else {
        const pt = hitPlane(ndc, s.drag.dragPlane);
        if (!pt) return;
        const node = s.gNodes.find(n => n.id === s.drag.nodeId);
        if (!node) return;
        // Y-up: XZ 평면에서 x, z를 델타로 이동
        node.x = s.drag.nodeStartX + (pt.x - s.drag.initialPt.x);
        node.z = s.drag.nodeStartZ + (pt.z - s.drag.initialPt.z);
        const mesh = s.meshes.find(m => m.userData.nodeId === node.id);
        if (mesh) mesh.position.set(node.x, node.y, node.z);
        gizmo.position.set(node.x, node.y, node.z);
        rebuildEdges(node.id);
      }
    });

    canvas.addEventListener('pointerup', (e) => {
      if (s.drag) {
        const node = s.gNodes.find(n => n.id === s.drag.nodeId);
        s.drag = null;
        orbit.enabled = true;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (node) {
          setNodes([...s.gNodes]);
          setForm(f => ({ ...f, x: node.x, y: node.y, z: node.z }));
        }
        return;
      }

      // 5px 이상 이동하면 드래그로 간주 — 좌클릭 pan, 우클릭 rotate 모두 해당
      if (s.downPos) {
        const dx = e.clientX - s.downPos.x;
        const dy = e.clientY - s.downPos.y;
        if (dx * dx + dy * dy > 25) return;
      }

      const ndc = toNDC(e);

      if (e.button === 0) {
        const nodeId = hitNode(ndc);
        if (nodeId) {
          selectNode(nodeId);
        } else if (addModeRef.current) {
          const pt = hitPlane(ndc, groundPlane);
          if (!pt) return;
          const id   = mkNodeId();
          const node = { id, name: id, type: 'waypoint', x: pt.x, y: pt.y, z: pt.z };
          s.gNodes.push(node);
          addNodeMesh(node);
          setNodes([...s.gNodes]);
          selectNode(id);
        } else {
          selectNode(null);
        }

      } else if (e.button === 2) {
        const nodeId = hitNode(ndc);
        if (nodeId && selIdRef.current && nodeId !== selIdRef.current) {
          const from = selIdRef.current;
          const to   = nodeId;
          const dup  = s.gEdges.some(
            ex => (ex.from === from && ex.to === to) || (ex.from === to && ex.to === from),
          );
          if (!dup) {
            const edge = { id: mkEdgeId(), from, to };
            s.gEdges.push(edge);
            addEdgeLine(edge);
            setEdges([...s.gEdges]);
          }
        } else if (nodeId) {
          selectNode(nodeId);
        } else {
          selectNode(null);
        }
      }
    });

    const keys = new Set();
    const onKeyDown = (e) => {
      // 입력창 포커스 중이면 이동 무시
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      keys.add(e.code);
      if (e.code === 'Escape' && addModeRef.current) {
        addModeRef.current = false;
        setAddMode(false);
      }
    };
    const onKeyUp = (e) => { keys.delete(e.code); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ─ WASD 이동 벡터 계산 (Y-up) ──────────────────────────────────────
    const _fwd   = new THREE.Vector3();
    const _right = new THREE.Vector3();
    const _move  = new THREE.Vector3();

    const applyWASD = () => {
      const active = ['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE'].some(k => keys.has(k));
      if (!active) return;

      const dist = camera.position.distanceTo(orbit.target);
      const speed = THREE.MathUtils.clamp(
        dist * EDITOR_MOVE_SPEED_FACTOR,
        EDITOR_MIN_MOVE_SPEED,
        EDITOR_MAX_MOVE_SPEED,
      );

      // 수평 전진 방향: 카메라→타겟을 XZ 평면에 투영 (Y-up)
      camera.getWorldDirection(_fwd);
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();

      // 수평 우측 방향
      _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();
      if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);

      _move.set(0, 0, 0);
      if (keys.has('KeyW')) _move.addScaledVector(_fwd,   speed);
      if (keys.has('KeyS')) _move.addScaledVector(_fwd,  -speed);
      if (keys.has('KeyA')) _move.addScaledVector(_right, -speed);
      if (keys.has('KeyD')) _move.addScaledVector(_right,  speed);
      if (keys.has('KeyE')) _move.y += speed;   // Y-up: E=올라가기
      if (keys.has('KeyQ')) _move.y -= speed;   // Q=내려가기

      camera.position.add(_move);
      orbit.target.add(_move);
      orbit.update();
    };

    // ─ 애니메이션 루프 ───────────────────────────────────────────────────
    let rafId;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      applyWASD();
      if (!s.drag) orbit.update();
      grid.visible = showGridRef.current;
      if (s.splatRenderer?.isLoaded()) {
        renderer.setClearColor(EDITOR_VIEW_BACKGROUND, 1);
        s.splatRenderer.update();
        s.splatRenderer.render();
        const savedAutoClear = renderer.autoClear;
        const savedBackground = scene.background;
        renderer.autoClear = false;
        scene.background = null;

        const savedMeshVisibility = s.meshes.map(mesh => mesh.visible);
        const savedLineVisibility = s.lines.map(line => line.visible);
        const savedGizmoVisible = gizmo.visible;
        s.meshes.forEach(mesh => { mesh.visible = false; });
        s.lines.forEach(line => { line.visible = false; });
        gizmo.visible = false;
        renderer.render(scene, camera);
        s.meshes.forEach((mesh, index) => { mesh.visible = savedMeshVisibility[index]; });
        s.lines.forEach((line, index) => { line.visible = savedLineVisibility[index]; });
        gizmo.visible = savedGizmoVisible;

        const savedGridVisible = grid.visible;
        grid.visible = false;
        renderer.clearDepth();
        renderer.render(scene, camera);
        grid.visible = savedGridVisible;
        scene.background = savedBackground;
        renderer.autoClear = savedAutoClear;
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    // ─ 리사이즈 ─────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);   // CSS가 표시 크기 담당
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const loadGraphData = (graph) => {
      const graphNodes = graph?.nodes ?? [];
      const graphEdges = graph?.edges ?? [];
      if (!graphNodes.length) return false;

      s.gNodes.forEach(n => s.removeNodeMesh(n.id));
      s.gEdges.forEach(e => s.removeEdgeLine(e.id));
      s.gNodes = [];
      s.gEdges = [];
      _nSeq = 0;
      _eSeq = 0;

      graphNodes.forEach(n => {
        const node = { ...n, x: Number(n.x), y: Number(n.y), z: Number(n.z) };
        s.gNodes.push(node);
        addNodeMesh(node);
        const m = node.id.match(/^node_(\d+)$/);
        if (m) _nSeq = Math.max(_nSeq, parseInt(m[1]));
      });

      graphEdges.forEach(e => {
        s.gEdges.push(e);
        addEdgeLine(e);
        const m = e.id.match(/^edge_(\d+)$/);
        if (m) _eSeq = Math.max(_eSeq, parseInt(m[1]));
      });

      setNodes([...s.gNodes]);
      setEdges([...s.gEdges]);
      selectNode(null);
      return true;
    };

    // 새 편집은 등록된 노드 없이 빈 그래프에서 시작한다.
    loadGraphData({ nodes: [], edges: [] });

    // ─ PLY 모델 ──────────────────────────────────────────────────────────
    const applyModelBounds = (geo) => {
      geo.computeBoundingBox();
      const box = geo.boundingBox;
      if (!box) return;

      const center = new THREE.Vector3();
      box.getCenter(center);
      const floorY = center.y - box.getSize(new THREE.Vector3()).y * EDITOR_GROUND_CENTER_OFFSET_RATIO;
      orbit.target.copy(center);
      s.groundPlane.constant = -floorY;
      grid.position.y = floorY;
      rebuildGrid(box);

      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.z, 1);

      s.nodeScale = THREE.MathUtils.clamp(
        maxDim * EDITOR_NODE_SCALE_FACTOR,
        EDITOR_MIN_NODE_SCALE,
        EDITOR_MAX_NODE_SCALE,
      );
      s.meshes.forEach(m => m.scale.setScalar(s.nodeScale));
      gizmo.scale.setScalar(s.nodeScale);

      camera.position.set(center.x, center.y + maxDim * 0.8, center.z + maxDim);
      orbit.update();
    };

    const loadPlyBounds = (plyUrl) => new Promise((resolve, reject) => {
      new PLYLoader().load(
        plyUrl,
        (geo) => {
          geo.rotateX(MODEL_ROTATION_X);
          applyModelBounds(geo);
          geo.dispose();
          resolve();
        },
        undefined,
        reject,
      );
    });

    const loadModel = async (modelUrl) => {
      const editorModelUrl = modelUrl || DEFAULT_MODEL_URL;
      setModelLoadStatus('loading');
      try {
        await loadPlyBounds(editorModelUrl);
      } catch (error) {
        console.warn('Could not read PLY bounds in graph editor.', editorModelUrl, error);
      }

      try {
        await s.splatRenderer.loadSplatModel(editorModelUrl, SPLAT_MODEL_TRANSFORM);
        setModelLoadStatus('ready');
      } catch (error) {
        console.warn('Could not render model as 3DGS in graph editor. Falling back to PLY mesh.', editorModelUrl, error);
        loadPly(editorModelUrl, editorModelUrl !== DEFAULT_MODEL_URL);
      }
    };

    const loadPly = (plyUrl, canFallbackToDefault = false) => {
      new PLYLoader().load(
        plyUrl,
        (geo) => {
          geo.rotateX(MODEL_ROTATION_X);
          geo.computeVertexNormals();
          const mat = new THREE.MeshLambertMaterial({
            vertexColors: !!geo.attributes.color,
            color: 0x8090a0,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          s.modelMesh = mesh;
          scene.add(mesh);
          geo.computeBoundingBox();
          const box    = geo.boundingBox;
          const center = new THREE.Vector3();
          box.getCenter(center);
          const floorY = center.y - box.getSize(new THREE.Vector3()).y * EDITOR_GROUND_CENTER_OFFSET_RATIO;
          orbit.target.copy(center);
          s.groundPlane.constant = -floorY;
          grid.position.y        = floorY;
          rebuildGrid(box);

          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.z);

          // PLY 크기에 비례한 노드/기즈모 스케일 (수평 범위의 약 1.5%)
          s.nodeScale = THREE.MathUtils.clamp(
            maxDim * EDITOR_NODE_SCALE_FACTOR,
            EDITOR_MIN_NODE_SCALE,
            EDITOR_MAX_NODE_SCALE,
          );
          s.meshes.forEach(m => m.scale.setScalar(s.nodeScale));
          gizmo.scale.setScalar(s.nodeScale);

          // 카메라를 모델 위에서 바라보도록 재배치 (Y-up)
          camera.position.set(center.x, center.y + maxDim * 0.8, center.z + maxDim);
          orbit.update();
          setModelLoadStatus('ready');
        },
        undefined,
        (error) => {
          console.warn('Could not load PLY in graph editor.', plyUrl, error);
          if (canFallbackToDefault && plyUrl !== DEFAULT_MODEL_URL) loadPly(DEFAULT_MODEL_URL, false);
          else setModelLoadStatus('error');
        },
      );
    };

    // 에디터는 로컬 model_editor_cut을 우선 사용하고, 없으면 원본/API/default로 fallback한다.
    if (graphTargetId) {
      const detailUrl = graphTargetType === 'space'
        ? `${API}/api/spaces/${graphTargetId}`
        : `${API}/api/floors/${graphTargetId}`;
      const graphUrl = graphTargetType === 'space'
        ? `${API}/api/navigation/spaces/${graphTargetId}/graph`
        : `${API}/api/navigation/floors/${graphTargetId}/graph`;
      fetch(detailUrl)
        .then(r => r.ok ? r.json() : null)
        .then(async (target) => {
          const originalModelUrl = getTargetPlyFileUrl(graphTargetType, graphTargetId);
          const editorApiUrl = target?.editor_splat_path || target?.editor_object_key
            ? getTargetEditorPlyFileUrl(graphTargetType, graphTargetId)
            : null;
          const modelUrl = await pickFirstExistingUrl([
            editorApiUrl,
            target?.editor_splat_path,
            originalModelUrl ? getEditorCutModelUrl(originalModelUrl) : null,
            target?.splat_path ? getEditorCutModelUrl(target.splat_path) : null,
            ...(graphTargetType === 'floor' ? getLocalFloorEditorModelUrls(target) : []),
            originalModelUrl,
            target?.splat_path,
            ...(graphTargetType === 'floor' ? getLocalFloorModelUrls(target) : []),
            DEFAULT_MODEL_URL,
          ]);
          loadModel(modelUrl);
        })
        .catch(async () => {
          const modelUrl = await pickFirstExistingUrl([
            DEFAULT_MODEL_URL,
          ]);
          loadModel(modelUrl);
        });
      fetch(graphUrl)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.graph) loadGraphData(data.graph);
        })
        .catch(error => {
          console.warn('Could not load saved graph in graph editor.', graphUrl, error);
        });
    } else {
      pickFirstExistingUrl([
        getEditorCutModelUrl(DEFAULT_MODEL_URL),
        DEFAULT_MODEL_URL,
      ]).then(loadModel);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      orbit.dispose();
      s.splatRenderer?.dispose();
      disposeGrid();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ─── React 핸들러 ────────────────────────────────────────────────────────
  const handleToggleAddMode = () => {
    setAddMode(v => { addModeRef.current = !v; return !v; });
  };

  const handleApplyForm = () => {
    const s = threeRef.current;
    if (!s || !selId) return;
    const node = s.gNodes.find(n => n.id === selId);
    if (!node) return;
    Object.assign(node, {
      name: form.name, type: form.type,
      x: Number(form.x), y: Number(form.y), z: Number(form.z),
      target_type: form.target_space_id ? 'space' : null,
      target_space_id: form.target_space_id ? Number(form.target_space_id) : null,
    });
    const mesh = s.meshes.find(m => m.userData.nodeId === selId);
    if (mesh) {
      mesh.position.set(node.x, node.y, node.z);
      mesh.material.color.setHex((NODE_TYPES[node.type] || NODE_TYPES.waypoint).colorSel);
    }
    s.gizmo.position.set(node.x, node.y, node.z);
    s.rebuildEdges(selId);
    setNodes([...s.gNodes]);
  };

  const handleDeleteNode = () => {
    const s = threeRef.current;
    if (!s || !selId) return;
    s.gEdges.filter(e => e.from === selId || e.to === selId)
      .forEach(e => s.removeEdgeLine(e.id));
    s.gEdges = s.gEdges.filter(e => e.from !== selId && e.to !== selId);
    s.removeNodeMesh(selId);
    s.gNodes = s.gNodes.filter(n => n.id !== selId);
    selIdRef.current = null;
    setSelId(null);
    setNodes([...s.gNodes]);
    setEdges([...s.gEdges]);
  };

  const handleDeleteEdge = (edgeId) => {
    const s = threeRef.current;
    if (!s) return;
    s.removeEdgeLine(edgeId);
    s.gEdges = s.gEdges.filter(e => e.id !== edgeId);
    setEdges([...s.gEdges]);
  };

  const handleSelectNode = (id) => { threeRef.current?.selectNode(id); };

  const handleSave = async () => {
    const s = threeRef.current;
    if (!s) return;
    const data = {
      nodes: s.gNodes.map(({ id, name, type, x, y, z, target_type, target_space_id }) => ({
        id, name, type,
        x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4),
        target_type: target_space_id ? (target_type || 'space') : null,
        target_space_id: target_space_id || null,
      })),
      edges: s.gEdges.map(({ id, from, to }) => ({ id, from, to })),
    };

    setSaveStatus('saving');
    try {
      if (graphTargetId) {
        const graphUrl = graphTargetType === 'space'
          ? `${API}/api/navigation/spaces/${graphTargetId}/graph`
          : `${API}/api/navigation/floors/${graphTargetId}/graph`;
        const res = await fetch(graphUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
      }
      setSaveStatus('saved');
      onSaveGraph?.(data);
      if (!onSaveGraph) setTimeout(() => setSaveStatus(''), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  };

  const selNode = nodes.find(n => n.id === selId);
  const handleToggleGrid = () => {
    setShowGrid((value) => {
      const next = !value;
      showGridRef.current = next;
      if (threeRef.current?.grid) threeRef.current.grid.visible = next;
      return next;
    });
  };

  // ─── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="navgraph-page">
      <header className="navgraph-header">
        <button className="navgraph-back-btn" onClick={onExit}>← 뒤로</button>
        <span className="navgraph-header-title">
          {floorLabel ? `그래프 에디터 — ${floorLabel}` : '내비게이션 그래프 에디터'}
        </span>
        <button
          type="button"
          className={`navgraph-header-toggle ${showGrid ? 'active' : ''}`}
          onClick={handleToggleGrid}
        >
          좌표축 표시
        </button>
        <div className="navgraph-header-tips">
          <span><span style={{ color: '#ff6666' }}>■</span> X축</span>
          <span><span style={{ color: '#4488ff' }}>■</span> Z축</span>
          <span>좌클릭 선택/배치 · 우클릭 엣지 연결 · 좌드래그 이동 · 우드래그 시점전환</span>
        </div>
      </header>

      <div className="navgraph-body">
        <div className="navgraph-canvas-wrap">
          <div ref={mountRef} className="navgraph-canvas" />
          {modelLoadStatus === 'loading' && (
            <div className="navgraph-model-loading">
              <div className="navgraph-model-loading-box">
                <div className="navgraph-model-loading-title">PLY 모델을 불러오는 중입니다</div>
                <div className="navgraph-model-loading-sub">파일 크기에 따라 시간이 걸릴 수 있습니다.</div>
              </div>
            </div>
          )}
          {modelLoadStatus === 'error' && (
            <div className="navgraph-model-loading navgraph-model-loading-error">
              <div className="navgraph-model-loading-box">
                <div className="navgraph-model-loading-title">PLY 모델을 불러오지 못했습니다</div>
                <div className="navgraph-model-loading-sub">파일 또는 네트워크 상태를 확인하세요.</div>
              </div>
            </div>
          )}
        </div>

        <aside className="navgraph-panel">
          <div className="navgraph-section">
            <button
              className={`navgraph-btn ${addMode ? 'navgraph-btn-active' : 'navgraph-btn-primary'}`}
              onClick={handleToggleAddMode}
            >
              {addMode ? '⬤ 배치 중… (빈 공간 클릭)' : '+ 노드 추가'}
            </button>
          </div>

          {selNode && (
            <div className="navgraph-section navgraph-edit-box">
              <div className="navgraph-edit-title">선택된 노드</div>
              <div className="navgraph-row">
                <label>이름</label>
                <input className="navgraph-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="navgraph-row">
                <label>유형</label>
                <select className="navgraph-select" value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(NODE_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {graphTargetType === 'floor' && (
                <div className="navgraph-row">
                  <label>연결 공간</label>
                  <select
                    className="navgraph-select"
                    value={form.target_space_id || ''}
                    onChange={e => setForm(f => ({ ...f, target_space_id: e.target.value }))}
                  >
                    <option value="">없음</option>
                    {spaces.map((space) => (
                      <option key={space.id} value={space.id}>
                        {space.name || `Space ${space.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="navgraph-row navgraph-pos-row">
                <label>위치</label>
                <div className="navgraph-xyz">
                  {['x', 'y', 'z'].map(axis => (
                    <div key={axis} className="navgraph-axis">
                      <span style={axis === 'x' ? { color: '#ff6666' } : axis === 'y' ? { color: '#66cc66' } : {}}>
                        {axis.toUpperCase()}
                      </span>
                      <input type="number" step="0.1" className="navgraph-input-sm"
                        value={parseFloat(form[axis] ?? 0).toFixed(2)}
                        onChange={e => setForm(f => ({ ...f, [axis]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="navgraph-btn-group">
                <button className="navgraph-btn navgraph-btn-primary" onClick={handleApplyForm}>적용</button>
                <button className="navgraph-btn navgraph-btn-danger" onClick={handleDeleteNode}>삭제</button>
              </div>
            </div>
          )}

          <div className="navgraph-section">
            <div className="navgraph-list-header">노드 ({nodes.length})</div>
            <div className="navgraph-list">
              {nodes.map(n => (
                <div key={n.id}
                  className={`navgraph-list-item ${n.id === selId ? 'active' : ''}`}
                  onClick={() => handleSelectNode(n.id)}>
                  <span className="navgraph-dot" style={{ background: NODE_TYPES[n.type]?.hex || '#888' }} />
                  <span className="navgraph-item-name">{n.name}</span>
                  <span className="navgraph-item-type">{NODE_TYPES[n.type]?.label}</span>
                </div>
              ))}
              {nodes.length === 0 && <div className="navgraph-empty">노드 없음</div>}
            </div>
          </div>

          <div className="navgraph-section">
            <div className="navgraph-list-header">엣지 ({edges.length})</div>
            <div className="navgraph-list">
              {edges.map(e => {
                const a = nodes.find(n => n.id === e.from);
                const b = nodes.find(n => n.id === e.to);
                return (
                  <div key={e.id} className="navgraph-list-item">
                    <span className="navgraph-item-name">{a?.name || e.from} ↔ {b?.name || e.to}</span>
                    <button className="navgraph-del-btn" onClick={() => handleDeleteEdge(e.id)}>✕</button>
                  </div>
                );
              })}
              {edges.length === 0 && <div className="navgraph-empty">엣지 없음</div>}
            </div>
          </div>

          <div className="navgraph-section">
            <button className="navgraph-btn navgraph-btn-save" onClick={handleSave}
              disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? '저장 중…'
                : saveStatus === 'saved' ? '✓ 저장됨'
                : saveStatus === 'error' ? '✕ 저장 실패'
                : '저장'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
