import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { createOrbitViewControls } from '../controls/createOrbitViewControls.js';
import { createPedestrianControls } from '../controls/createPedestrianControls.js';
import {
  createFloorArrowMesh,
  updateArrowTransform,
  updateArrowVisibility,
} from '../navigation/FloorArrows.js';
import { SPLAT_MODEL_TRANSFORM } from '../renderers/modelTransforms.js';
import { createSplatRenderer } from '../renderers/SplatModelRenderer.js';

const DEFAULT_MODEL_URL = '/Open3d.ply';
const NAV_CORRIDOR_RADIUS = 0.8;
const HUMAN_EYE_HEIGHT_RATIO = 0.025;
const MIN_HUMAN_EYE_HEIGHT = 0.08;
const MAX_HUMAN_EYE_HEIGHT = 0.18;
const ROUTE_ARROW_CAMERA_FORWARD_OFFSET = 0.1656;
const ROUTE_ARROW_FLOOR_LIFT = 0.069575;
const LABELED_NODE_TYPES = new Set(['start', 'destination', 'door']);
const ORBIT_ARROW_LOOK_AHEAD = 0.45;

const withDefaultModelFallback = (url) => {
  const primary = url || DEFAULT_MODEL_URL;
  return primary === DEFAULT_MODEL_URL ? [DEFAULT_MODEL_URL] : [primary, DEFAULT_MODEL_URL];
};

export default function Viewer3D({
  selectedDest,
  routePoints,
  navGraph,
  navCommand,
  initialViewMode = 'orbit',
  modelUrl = DEFAULT_MODEL_URL,
}) {
  const containerRef    = useRef(null);
  const threeRef        = useRef(null); // { scene, plyOffset, renderer }
  const cameraRef       = useRef(null);
  const controlsRef     = useRef(null);
  const routeGroupRef   = useRef(null);
  const navGraphRef     = useRef(null); // Three.js group (visual)
  const svArrowsRef     = useRef(null); // 거리뷰 바닥 화살표 그룹
  const navGraphDataRef = useRef(navGraph); // 이벤트 핸들러용 최신 navGraph
  const nodeLabelAnchorsRef = useRef([]);
  const nodeLabelSnapshotRef = useRef('');

  // 거리뷰 이동 상태 (React state 아닌 ref — 매 프레임마다 쓰임)
  const routePointsRef = useRef(routePoints);
  const viewModeRef = useRef(initialViewMode);
  const renderModeRef = useRef('splat');
  const orbitViewRef = useRef(null);
  const pedestrianControlsRef = useRef(null);
  const meshModelRef = useRef(null);
  const splatRendererRef = useRef(null);

  const svRef = useRef({
    active: false,
    transitioning: false,
    fromPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    nextNodeId: null,
    progress: 0,
    eyeHeight: 0.05,
  });

  const [status, setStatus]   = useState('loading');
  const [viewMode, setViewMode] = useState(initialViewMode);
  const [renderMode] = useState('splat');
  const [svNodeId, setSvNodeId] = useState(null); // 현재 노드 (화살표 재렌더 트리거)
  const [nodeLabels, setNodeLabels] = useState([]);

  useEffect(() => { navGraphDataRef.current = navGraph; }, [navGraph]);
  useEffect(() => { routePointsRef.current = routePoints; }, [routePoints]);

  const getNavOffset = (threeState = threeRef.current) => {
    if (!threeState || renderModeRef.current === 'splat') return new THREE.Vector3();
    return threeState.plyOffset;
  };

  const updateNodeLabelOverlay = () => {
    const container = containerRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || nodeLabelAnchorsRef.current.length === 0) {
      if (nodeLabelSnapshotRef.current !== '[]') {
        nodeLabelSnapshotRef.current = '[]';
        setNodeLabels([]);
      }
      return;
    }

    const width = container.clientWidth;
    const height = container.clientHeight;
    const projected = nodeLabelAnchorsRef.current
      .map(label => {
        const p = label.position.clone().project(camera);
        return {
          id: label.id,
          name: label.name,
          visible: p.z >= -1 && p.z <= 1,
          x: Math.round((p.x * 0.5 + 0.5) * width),
          y: Math.round((-p.y * 0.5 + 0.5) * height),
        };
      })
      .filter(label => label.visible);

    const snapshot = JSON.stringify(projected);
    if (snapshot !== nodeLabelSnapshotRef.current) {
      nodeLabelSnapshotRef.current = snapshot;
      setNodeLabels(projected);
    }
  };

  useEffect(() => {
    renderModeRef.current = renderMode;

    if (meshModelRef.current) {
      meshModelRef.current.visible = renderMode === 'mesh';
    }

    const splatRenderer = splatRendererRef.current;
    if (!splatRenderer) return;

    if (renderMode === 'splat') {
      setStatus('loading');
      const [primaryUrl, fallbackUrl] = withDefaultModelFallback(modelUrl);
      splatRenderer.loadSplatModel(primaryUrl, SPLAT_MODEL_TRANSFORM)
        .then(() => setStatus('ready'))
        .catch((error) => {
          if (fallbackUrl) {
            console.warn('Failed to load selected 3DGS model. Falling back to default model.', error);
            return splatRenderer.loadSplatModel(fallbackUrl, SPLAT_MODEL_TRANSFORM)
              .then(() => setStatus('ready'));
          }
          console.error('Failed to load 3DGS splat model.', error);
          setStatus('error');
          return null;
        });
      return;
    }

    splatRenderer.unload();
    if (meshModelRef.current) setStatus('ready');
  }, [renderMode]);

  const distanceToSegmentXZ = (point, a, b) => {
    const abX = b.x - a.x;
    const abZ = b.z - a.z;
    const apX = point.x - a.x;
    const apZ = point.z - a.z;
    const lenSq = abX * abX + abZ * abZ;
    const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, (apX * abX + apZ * abZ) / lenSq)) : 0;
    const closestX = a.x + abX * t;
    const closestZ = a.z + abZ * t;
    const dx = point.x - closestX;
    const dz = point.z - closestZ;
    return Math.sqrt(dx * dx + dz * dz);
  };

  const canMoveWithinNavCorridor = (position) => {
    const ng = navGraphDataRef.current;
    const t = threeRef.current;
    if (!ng?.nodes?.length || !ng?.edges?.length || !t || !position) return true;

    const off = getNavOffset(t);
    const nodeMap = Object.fromEntries(ng.nodes.map(n => [n.id, n]));
    let minDistance = Infinity;

    ng.edges.forEach(edge => {
      const from = nodeMap[edge.from];
      const to = nodeMap[edge.to];
      if (!from || !to) return;

      const a = { x: from.x - off.x, z: from.z - off.z };
      const b = { x: to.x - off.x, z: to.z - off.z };
      minDistance = Math.min(minDistance, distanceToSegmentXZ(position, a, b));
    });

    return !Number.isFinite(minDistance) || minDistance <= NAV_CORRIDOR_RADIUS;
  };

  const getNextRoutePoint = (points, fromPosition, toViewPosition) => {
    if (!points?.length || !fromPosition || !toViewPosition) return null;
    const minDistance = Math.max(svRef.current.eyeHeight * 1.5, 0.08);

    const route = points
      .filter(p => p.x != null && p.y != null && p.z != null)
      .map(p => ({ raw: p, pos: toViewPosition(p) }));
    if (route.length === 0) return null;

    let nearestIndex = 0;
    let nearestDistance = Infinity;
    route.forEach(({ pos }, index) => {
      const dx = pos.x - fromPosition.x;
      const dz = pos.z - fromPosition.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    return route.slice(nearestIndex + 1).find(({ pos }) => {
        const dx = pos.x - fromPosition.x;
        const dz = pos.z - fromPosition.z;
        return Math.sqrt(dx * dx + dz * dz) > minDistance;
      })
      ?? (nearestDistance > minDistance ? route[nearestIndex] : null);
  };

  const updateRouteArrowFromCamera = () => {
    const group = svArrowsRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const t = threeRef.current;
    if (viewModeRef.current !== 'pedestrian' || !group || !camera || !controls || !t) return;

    const routeArrow = group.children.find(child => child.userData?.kind === 'route');
    if (!routeArrow) return;

    const off = getNavOffset(t);
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);
    const floorY = controls.target.y;
    const cameraForward = new THREE.Vector3();
    camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    if (cameraForward.lengthSq() < 1e-8) cameraForward.set(0, 0, -1);
    cameraForward.normalize();

    const from = new THREE.Vector3(
      camera.position.x + cameraForward.x * ROUTE_ARROW_CAMERA_FORWARD_OFFSET,
      floorY,
      camera.position.z + cameraForward.z * ROUTE_ARROW_CAMERA_FORWARD_OFFSET,
    );
    const nextRoutePoint = getNextRoutePoint(routePointsRef.current, from, toV);
    if (!nextRoutePoint) {
      routeArrow.visible = false;
      return;
    }

    updateArrowTransform(routeArrow, from, nextRoutePoint.pos, floorY, {
      forwardOffset: 0,
      floorLift: ROUTE_ARROW_FLOOR_LIFT,
    });
  };

  const applyOrbitMode = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (orbitViewRef.current) {
      camera.position.copy(orbitViewRef.current.position);
      controls.target.copy(orbitViewRef.current.target);
    }

    controls.enabled = true;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 0.001;
    controls.maxDistance = Infinity;
    controls.update();
  };

  const placeCameraAtNode = (nodeId) => {
    const ng       = navGraphDataRef.current;
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    const t        = threeRef.current;
    if (!ng || !camera || !controls || !t || !nodeId) return false;

    const node = ng.nodes?.find(n => n.id === nodeId);
    if (!node) return false;

    const off = getNavOffset(t);
    const pos = new THREE.Vector3(node.x - off.x, node.y - off.y, node.z - off.z);
    const eyeH = svRef.current.eyeHeight;

    if (viewModeRef.current === 'pedestrian') {
      camera.position.set(pos.x, pos.y + eyeH, pos.z);
      pedestrianControlsRef.current?.setEyeHeight(eyeH);
      pedestrianControlsRef.current?.setFloorY(pos.y);
      pedestrianControlsRef.current?.syncAnglesFromCamera();
      return true;
    }

    const viewOffset = new THREE.Vector3().subVectors(camera.position, controls.target);

    if (viewOffset.lengthSq() < 1e-8) viewOffset.set(0, eyeH, eyeH);
    viewOffset.normalize().multiplyScalar(eyeH);

    camera.position.copy(pos).add(viewOffset);
    controls.target.copy(pos);
    pedestrianControlsRef.current?.setEyeHeight(eyeH);
    pedestrianControlsRef.current?.setFloorY(pos.y);
    pedestrianControlsRef.current?.syncAnglesFromCamera();
    controls.update();
    return true;
  };

  const applyPedestrianMode = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    const eyeH = svRef.current.eyeHeight;
    pedestrianControlsRef.current?.setEyeHeight(eyeH);
    if (!placeCameraAtNode(svNodeId)) pedestrianControlsRef.current?.setFloorY(0);
    controls.enabled = false;
    controls.enableRotate = true;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minDistance = eyeH;
    controls.maxDistance = eyeH;
  };

  useEffect(() => {
    const previousMode = viewModeRef.current;
    if (previousMode === 'orbit' && viewMode === 'pedestrian' && cameraRef.current && controlsRef.current) {
      orbitViewRef.current = {
        position: cameraRef.current.position.clone(),
        target: controlsRef.current.target.clone(),
      };
    }
    viewModeRef.current = viewMode;
    if (viewMode === 'orbit') applyOrbitMode();
    else applyPedestrianMode();
  }, [viewMode, svNodeId, status]);

  // ─── Three.js 초기화 (한 번만) ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    const camera = new THREE.PerspectiveCamera(
      60, container.clientWidth / container.clientHeight, 0.001, 1000,
    );
    camera.position.set(0, -3, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = createOrbitViewControls(camera, renderer.domElement, {
      isKeyboardEnabled: () => viewModeRef.current === 'orbit' && !svRef.current.transitioning,
    });
    controlsRef.current = controls;
    const pedestrianControls = createPedestrianControls(camera, renderer.domElement, {
      floorY: 0,
      eyeHeight: svRef.current.eyeHeight,
      isEnabled: () => viewModeRef.current === 'pedestrian' && !svRef.current.transitioning,
      canMoveTo: canMoveWithinNavCorridor,
      onTargetChange: (target) => controls.target.copy(target),
    });
    pedestrianControlsRef.current = pedestrianControls;

    const plyOffset = new THREE.Vector3();
    threeRef.current = { scene, plyOffset, renderer };
    splatRendererRef.current = createSplatRenderer({ renderer, camera, scene });
    if (renderModeRef.current === 'splat') {
      setStatus('loading');
      const [primaryUrl, fallbackUrl] = withDefaultModelFallback(modelUrl);
      splatRendererRef.current.loadSplatModel(primaryUrl, SPLAT_MODEL_TRANSFORM)
        .then(() => setStatus('ready'))
        .catch((error) => {
          if (fallbackUrl) {
            console.warn('Failed to load selected 3DGS model. Falling back to default model.', error);
            return splatRendererRef.current.loadSplatModel(fallbackUrl, SPLAT_MODEL_TRANSFORM)
              .then(() => setStatus('ready'));
          }
          console.error('Failed to load 3DGS splat model.', error);
          setStatus('error');
          return null;
        });
    }

    new PLYLoader().load(
      modelUrl,
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        plyOffset.copy(center);
        geometry.translate(-center.x, -center.y, -center.z);

        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            vertexColors: geometry.hasAttribute('color'),
            ...(geometry.hasAttribute('color') ? {} : { color: 0x88ccff }),
            side: THREE.DoubleSide,
          }),
        );
        mesh.visible = renderModeRef.current === 'mesh';
        meshModelRef.current = mesh;
        scene.add(mesh);

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        const box  = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3()).length();
        svRef.current.eyeHeight = THREE.MathUtils.clamp(
          size * HUMAN_EYE_HEIGHT_RATIO,
          MIN_HUMAN_EYE_HEIGHT,
          MAX_HUMAN_EYE_HEIGHT,
        );
        pedestrianControls.setEyeHeight(svRef.current.eyeHeight);
        setStatus('ready');
      },
      undefined,
      () => setStatus('error'),
    );

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // 거리뷰 이동 보간
      const sv = svRef.current;
      if (sv.active && sv.transitioning) {
        sv.progress = Math.min(sv.progress + 0.035, 1);
        const t = sv.progress * sv.progress * (3 - 2 * sv.progress); // smoothstep
        camera.position.lerpVectors(sv.fromPos, sv.toPos, t);
        controls.target.lerpVectors(sv.fromTarget, sv.toTarget, t);

        if (sv.progress >= 1) {
          sv.transitioning = false;
          setSvNodeId(sv.nextNodeId);
          pedestrianControls.setFloorY(controls.target.y);
          pedestrianControls.syncAnglesFromCamera();
          controls.enabled = viewModeRef.current === 'orbit';
        }
      }

      controls.updateKeyboardMovement?.(delta);
      pedestrianControls.update(delta);

      // 화살표 펄스 애니메이션
      if (svArrowsRef.current) {
        updateRouteArrowFromCamera();
        const pulse = 0.85 + Math.sin(Date.now() * 0.004) * 0.15;
        svArrowsRef.current.traverse(obj => {
          if (obj.userData.isPulse) obj.scale.setScalar(pulse);
        });
        updateArrowVisibility(svArrowsRef.current, camera, {
          viewMode: viewModeRef.current,
          maxDistance: 10,
        });
      }

      if (viewModeRef.current === 'orbit' || sv.transitioning) controls.update();
      updateNodeLabelOverlay();
      const splatRenderer = splatRendererRef.current;
      if (renderModeRef.current === 'splat' && splatRenderer?.isLoaded()) {
        splatRenderer.update();
        splatRenderer.render();
        const savedAutoClear = renderer.autoClear;
        const savedBackground = scene.background;
        renderer.autoClear = false;
        scene.background = null;
        renderer.clearDepth();
        renderer.render(scene, camera);
        scene.background = savedBackground;
        renderer.autoClear = savedAutoClear;
      } else {
        renderer.render(scene, camera);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      pedestrianControls.dispose();
      pedestrianControlsRef.current = null;
      controls.dispose();
      splatRendererRef.current?.dispose();
      splatRendererRef.current = null;
      meshModelRef.current = null;
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // ─── PLY 로드 완료 시 무작위 노드에서 거리뷰 시작 ────────────────────────────
  useEffect(() => {
    if (status !== 'ready' || !navGraph?.nodes?.length) return;
    if (svRef.current.active) return; // 이미 초기화됨

    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    const t        = threeRef.current;
    if (!camera || !controls || !t) return;

    const randomNode = navGraph.nodes[Math.floor(Math.random() * navGraph.nodes.length)];
    const off = getNavOffset(t);
    const pos = new THREE.Vector3(randomNode.x - off.x, randomNode.y - off.y, randomNode.z - off.z);
    const eyeH = svRef.current.eyeHeight;

    camera.position.set(pos.x, pos.y + eyeH, pos.z);
    controls.target.copy(pos);
    pedestrianControlsRef.current?.setEyeHeight(eyeH);
    pedestrianControlsRef.current?.setFloorY(pos.y);
    if (viewModeRef.current === 'pedestrian') {
      controls.minDistance = eyeH;
      controls.maxDistance = eyeH;
      controls.enablePan = false;
    }
    controls.update();

    svRef.current.active = true;
    setSvNodeId(randomNode.id);
  }, [status, navGraph]);

  // ─── navCommand: 출발지로 카메라 이동 (안내 시작 버튼) ──────────────────────
  useEffect(() => {
    if (!navCommand) return;

    const ng       = navGraphDataRef.current;
    const camera   = cameraRef.current;
    const controls = controlsRef.current;
    const t        = threeRef.current;
    if (!ng || !camera || !controls || !t || !svRef.current.active) return;

    const nodeMap = Object.fromEntries(ng.nodes.map(n => [n.id, n]));
    const node = nodeMap[navCommand.nodeId];
    if (!node) return;

    const off = getNavOffset(t);
    const newTarget = new THREE.Vector3(node.x - off.x, node.y - off.y, node.z - off.z);
    const eyeH = svRef.current.eyeHeight;

    // 현재 시선 오프셋 유지 (카메라 방향 보존)
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    // 단, offset 크기를 eyeH로 정규화 (줌이 달라져도 일관성 유지)
    offset.normalize().multiplyScalar(eyeH);

    const sv = svRef.current;
    sv.fromPos.copy(camera.position);
    sv.fromTarget.copy(controls.target);
    sv.toTarget.copy(newTarget);
    sv.toPos.addVectors(newTarget, offset);
    sv.nextNodeId = navCommand.nodeId;
    sv.progress = 0;
    sv.transitioning = true;
    controls.enabled = false;
  }, [navCommand, status]);

  // ─── navGraph 시각화 ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !navGraph) return;

    if (navGraphRef.current) {
      t.scene.remove(navGraphRef.current);
      navGraphRef.current.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      navGraphRef.current = null;
      nodeLabelAnchorsRef.current = [];
      nodeLabelSnapshotRef.current = '[]';
      setNodeLabels([]);
    }

    const { nodes, edges } = navGraph;
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const off = getNavOffset(t);
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);

    const group = new THREE.Group();
    const labelAnchors = [];

    edges.forEach(e => {
      const a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return;
      const geo = new THREE.BufferGeometry().setFromPoints([toV(a), toV(b)]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3b82f6 }));
      line.userData.isNavGraphEdge = true;
      line.visible = viewModeRef.current !== 'pedestrian';
      group.add(line);
    });

    const NODE_COLOR = { start: 0x22c55e, destination: 0xef4444, waypoint: 0xfbbf24, door: 0xa78bfa };
    nodes.forEach(n => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 12, 12),
        new THREE.MeshBasicMaterial({ color: NODE_COLOR[n.type] ?? 0xffffff, depthTest: false }),
      );
      sphere.position.copy(toV(n));
      sphere.renderOrder = 1;
      group.add(sphere);

      if (LABELED_NODE_TYPES.has(n.type) && n.name) {
        const labelPosition = sphere.position.clone();
        labelPosition.y += Math.max(svRef.current.eyeHeight * 0.45, 0.08);
        labelAnchors.push({ id: n.id, name: n.name, position: labelPosition });
      }
    });

    t.scene.add(group);
    navGraphRef.current = group;
    nodeLabelAnchorsRef.current = labelAnchors;
    updateNodeLabelOverlay();
  }, [navGraph, status, renderMode]);

  useEffect(() => {
    if (!navGraphRef.current) return;
    navGraphRef.current.traverse(obj => {
      if (obj.userData?.isNavGraphEdge) obj.visible = viewMode !== 'pedestrian';
    });
  }, [viewMode]);

  // ─── 경로 렌더링 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t) return;

    if (routeGroupRef.current) {
      t.scene.remove(routeGroupRef.current);
      routeGroupRef.current.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      routeGroupRef.current = null;
    }

    if (!routePoints || routePoints.length === 0) return;

    const pts = routePoints.filter(n => n.x != null && n.y != null && n.z != null);
    if (pts.length === 0) return;

    const off = getNavOffset(t);
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);

    const group = new THREE.Group();
    const positions = pts.flatMap(n => { const v = toV(n); return [v.x, v.y, v.z]; });
    const lineGeo = new LineGeometry();
    lineGeo.setPositions(positions);
    const { renderer } = t;
    const lineMat = new LineMaterial({
      color: 0xef4444, linewidth: 4,
      resolution: new THREE.Vector2(
        renderer?.domElement.clientWidth  ?? window.innerWidth,
        renderer?.domElement.clientHeight ?? window.innerHeight,
      ),
    });
    group.add(new Line2(lineGeo, lineMat));
    t.scene.add(group);
    routeGroupRef.current = group;
  }, [routePoints, renderMode]);

  // ─── 거리뷰 바닥 화살표 렌더링 ──────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;

    const cleanup = () => {
      if (svArrowsRef.current && t) {
        t.scene.remove(svArrowsRef.current);
        svArrowsRef.current.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
        svArrowsRef.current = null;
      }
    };

    if (!t || !navGraph || !svNodeId) { cleanup(); return; }

    const { nodes, edges } = navGraph;
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const curNode = nodeMap[svNodeId];
    if (!curNode) { cleanup(); return; }

    const adjIds = new Set();
    edges.forEach(e => {
      if (e.from === svNodeId) adjIds.add(e.to);
      if (e.to   === svNodeId) adjIds.add(e.from);
    });

    cleanup();

    const off = getNavOffset(t);
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);
    const curPos = toV(curNode);

    const group = new THREE.Group();
    group.name = 'sv-arrows';

    const camera = cameraRef.current;
    const routeBasePos = camera && viewModeRef.current === 'pedestrian'
      ? new THREE.Vector3(camera.position.x, curPos.y, camera.position.z)
      : curPos;
    const nextRoutePoint = viewModeRef.current === 'pedestrian'
      ? getNextRoutePoint(routePoints, routeBasePos, toV)
      : null;

    if (nextRoutePoint) {
      const arrow = createFloorArrowMesh(nextRoutePoint.raw.id, {
        kind: 'route',
        discColor: 0xf59e0b,
        coneColor: 0xfbbf24,
        scale: 1.25,
      });
      updateArrowTransform(arrow, routeBasePos, nextRoutePoint.pos, routeBasePos.y);
      group.add(arrow);
    } else {
      adjIds.forEach(id => {
        const adjNode = nodeMap[id];
        if (!adjNode) return;
        const adjPos = toV(adjNode);

        const arrow = createFloorArrowMesh(id);
        updateArrowTransform(arrow, curPos, adjPos, curPos.y);
        group.add(arrow);

      });
    }

    t.scene.add(group);
    svArrowsRef.current = group;

    return cleanup;
  }, [navGraph, routePoints, svNodeId, status, viewMode, renderMode]);

  // ─── 거리뷰 클릭 · 호버 핸들러 ─────────────────────────────────────────────
  useEffect(() => {
    const renderer = threeRef.current?.renderer;
    if (!renderer) return;

    const canvas = renderer.domElement;
    let downX = 0, downY = 0;

    const getHits = (clientX, clientY) => {
      const camera = cameraRef.current;
      if (!camera || !svArrowsRef.current) return [];
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const rc = new THREE.Raycaster();
      rc.setFromCamera(mouse, camera);
      const targets = [];
      svArrowsRef.current.traverse(o => { if (o.userData.isSvArrow) targets.push(o); });
      return rc.intersectObjects(targets);
    };

    const onPointerDown = (e) => { downX = e.clientX; downY = e.clientY; };

    const onPointerUp = (e) => {
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (Math.sqrt(dx * dx + dy * dy) > 5) return;

      const hits = getHits(e.clientX, e.clientY);
      if (hits.length === 0) return;

      const nodeId = hits[0].object.userData.nodeId;
      if (!nodeId || svRef.current.transitioning) return;

      const ng       = navGraphDataRef.current;
      const camera   = cameraRef.current;
      const controls = controlsRef.current;
      const t        = threeRef.current;
      if (!ng || !camera || !controls || !t) return;

      const nodeMap = Object.fromEntries(ng.nodes.map(n => [n.id, n]));
      const node = nodeMap[nodeId];
      if (!node) return;

      const off = getNavOffset(t);
      const newTarget = new THREE.Vector3(node.x - off.x, node.y - off.y, node.z - off.z);
      const eyeH = svRef.current.eyeHeight;

      // 현재 시선 방향 유지 (크기 = eyeH 고정)
      const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
      const target = newTarget.clone();

      if (viewModeRef.current === 'pedestrian') {
        if (offset.lengthSq() < 1e-8) offset.set(0, eyeH, eyeH);
        offset.normalize().multiplyScalar(eyeH);
      } else {
        const moveDir = new THREE.Vector3().subVectors(newTarget, controls.target);
        moveDir.y = 0;
        if (moveDir.lengthSq() < 1e-8) camera.getWorldDirection(moveDir);
        moveDir.y = 0;
        if (moveDir.lengthSq() > 1e-8) {
          moveDir.normalize();
          target.addScaledVector(moveDir, ORBIT_ARROW_LOOK_AHEAD);
        }
        target.y = Math.max(controls.target.y, newTarget.y) + Math.max(eyeH, 0.03);
        if (offset.lengthSq() < 1e-8) offset.set(0, eyeH, eyeH);
      }

      const sv = svRef.current;
      sv.fromPos.copy(camera.position);
      sv.fromTarget.copy(controls.target);
      sv.toTarget.copy(target);
      sv.toPos.addVectors(newTarget, offset);
      sv.nextNodeId = nodeId;
      sv.progress = 0;
      sv.transitioning = true;
      controls.enabled = false;
    };

    const onMouseMove = (e) => {
      if (!svRef.current.active) return;
      const hits = getHits(e.clientX, e.clientY);
      canvas.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup',   onPointerUp);
    canvas.addEventListener('mousemove',   onMouseMove);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup',   onPointerUp);
      canvas.removeEventListener('mousemove',   onMouseMove);
      canvas.style.cursor = '';
    };
  }, []); // 마운트 1회만 — 내부에서 ref를 통해 최신 값 참조

  // ─── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <div className="viewer-panel" style={{ position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
        {nodeLabels.map(label => (
          <div
            key={label.id}
            style={{
              position: 'absolute',
              left: label.x,
              top: label.y,
              transform: 'translate(-50%, -100%)',
              padding: '4px 8px',
              borderRadius: 6,
              border: '1px solid rgba(56,189,248,0.55)',
              background: 'rgba(8,14,28,0.76)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            {label.name}
          </div>
        ))}
      </div>

      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 3,
        display: 'flex', gap: 8,
      }}>
        <div style={{
          display: 'flex', gap: 6,
          background: 'rgba(10,10,30,0.72)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.16)',
          borderRadius: 8, padding: 4,
        }}>
          {[
            ['orbit', '자유시점'],
            ['pedestrian', '보행자시점'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              style={{
                border: 0,
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: viewMode === mode ? '#07111f' : 'rgba(255,255,255,0.82)',
                background: viewMode === mode ? '#38bdf8' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface-alt)', color: 'var(--color-text-muted)', fontSize: 13,
        }}>
          포인트 클라우드 로딩 중...
        </div>
      )}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface-alt)', color: '#ef4444', fontSize: 13,
        }}>
          파일 로드 실패 — 콘솔 확인
        </div>
      )}

      {/* 현재 위치 표시 */}
      {svNodeId && navGraph && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(10,10,30,0.78)', backdropFilter: 'blur(6px)',
          border: '1px solid rgba(56,189,248,0.3)',
          borderRadius: 8, padding: '6px 16px',
          color: '#fff', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>현재 위치</span>
          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
            {navGraph.nodes.find(n => n.id === svNodeId)?.name ?? svNodeId}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.35)' }}>· 파란 화살표 클릭으로 이동</span>
        </div>
      )}

      <div className="viewer-label">3D 뷰</div>
    </div>
  );
}
