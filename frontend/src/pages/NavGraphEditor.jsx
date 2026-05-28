import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

const API = 'https://port-0-backend-api-distribution-mp106n125ca57428.sel3.cloudtype.app';

// ─── 상수 ────────────────────────────────────────────────────────────────────
const NODE_TYPES = {
  start:       { label: '출발점',         hex: '#22c55e', color: 0x22c55e, colorSel: 0x86efac },
  destination: { label: '목적지 (길찾기)', hex: '#ef4444', color: 0xef4444, colorSel: 0xfca5a5 },
  waypoint:    { label: '경유점',          hex: '#94a3b8', color: 0x94a3b8, colorSel: 0xcbd5e1 },
  door:        { label: '문 (방 전환)',    hex: '#3b82f6', color: 0x3b82f6, colorSel: 0x93c5fd },
};

let _nSeq = 0;
let _eSeq = 0;
const mkNodeId = () => `node_${++_nSeq}`;
const mkEdgeId = () => `edge_${++_eSeq}`;

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
export default function NavGraphEditor({ onExit, floorId, floorLabel }) {
  const mountRef   = useRef(null);
  const threeRef   = useRef(null);
  const addModeRef = useRef(false);
  const selIdRef   = useRef(null);

  const [nodes,      setNodes]      = useState([]);
  const [edges,      setEdges]      = useState([]);
  const [selId,      setSelId]      = useState(null);
  const [addMode,    setAddMode]    = useState(false);
  const [form,       setForm]       = useState({ name: '', type: 'waypoint', x: 0, y: 0, z: 0 });
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'

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
    scene.background = new THREE.Color(0x1a1a2e);

    // ─ Camera — Y-up (PLY 좌표계 기준) ──────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 15, 10);

    // ─ Lights ────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // ─ Grid (XZ 평면, Y-up 기준 바닥) ────────────────────────────────────
    const grid = new THREE.GridHelper(100, 100, 0x2a3055, 0x1e2444);
    scene.add(grid);

    // ─ OrbitControls — 레퍼런스와 완전히 동일한 설정 ───────────────────
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping    = true;
    orbit.dampingFactor    = 0.1;       // 기본 0.05보다 빠른 응답감
    orbit.screenSpacePanning = true;
    orbit.rotateSpeed      = 1;
    orbit.minPolarAngle    = 0.05;
    orbit.maxPolarAngle    = Math.PI - 0.05;
    orbit.mouseButtons     = {
      LEFT:   THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT:  THREE.MOUSE.ROTATE,
    };
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    orbit.update();

    // ─ 바닥 평면 (XZ at y=0, Y-up) ──────────────────────────────────────
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster   = new THREE.Raycaster();

    // ─ 기즈모 (Unity 스타일 축 이동 핸들) ───────────────────────────────
    // Y-up: 수평 이동 축은 X(빨강)와 Z(파랑)
    const xArr = makeArrow(0xff4444);
    xArr.group.rotation.z = -Math.PI / 2;   // Y→X 방향
    xArr.shaft.userData.gizmoAxis = 'x';
    xArr.head.userData.gizmoAxis  = 'x';

    const zArr = makeArrow(0x4488ff);        // Y-up에서 Z는 수평축
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
      gizmo, gizmoMeshes,
      meshes:  [],
      lines:   [],
      gNodes:  [],
      gEdges:  [],
      downPos: null,
      drag: null,
      nodeScale: 1.0,  // PLY 로드 후 바운딩 박스 기준으로 갱신
    };
    threeRef.current = s;

    // ─ 헬퍼 함수 ─────────────────────────────────────────────────────────
    const canvas = renderer.domElement;

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
          setForm({ name: node.name, type: node.type, x: node.x, y: node.y, z: node.z });
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

      const dist  = camera.position.distanceTo(orbit.target);
      const speed = Math.max(0.01, dist * 0.03);

      // 수평 전진 방향: 카메라→타겟을 XZ 평면에 투영 (Y-up)
      _fwd.subVectors(orbit.target, camera.position);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
      _fwd.normalize();

      // 수평 우측 방향
      _right.crossVectors(_fwd, new THREE.Vector3(0, 1, 0)).normalize();

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
      renderer.render(scene, camera);
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

    // ─ 그래프 로드 (floor_id가 있을 때 API에서 가져옴) ───────────────────
    if (floorId) {
      fetch(`${API}/api/navigation/floors/${floorId}/graph`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          (data.nodes || []).forEach(n => {
            const node = { ...n, x: Number(n.x), y: Number(n.y), z: Number(n.z) };
            s.gNodes.push(node);
            addNodeMesh(node);
            // _nSeq 최신화 (충돌 방지)
            const m = node.id.match(/^node_(\d+)$/);
            if (m) _nSeq = Math.max(_nSeq, parseInt(m[1]));
          });
          (data.edges || []).forEach(e => {
            s.gEdges.push(e);
            addEdgeLine(e);
            const m = e.id.match(/^edge_(\d+)$/);
            if (m) _eSeq = Math.max(_eSeq, parseInt(m[1]));
          });
          setNodes([...s.gNodes]);
          setEdges([...s.gEdges]);
        })
        .catch(() => {});
    }

    // ─ PLY 모델 ──────────────────────────────────────────────────────────
    const loadPly = (plyUrl) => {
      new PLYLoader().load(
        plyUrl,
        (geo) => {
          geo.computeVertexNormals();
          const mat = new THREE.MeshLambertMaterial({
            vertexColors: !!geo.attributes.color,
            color: 0x8090a0,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
          });
          scene.add(new THREE.Mesh(geo, mat));
          geo.computeBoundingBox();
          const box    = geo.boundingBox;
          const center = new THREE.Vector3();
          box.getCenter(center);
          orbit.target.copy(center);
          s.groundPlane.constant = -center.y;
          grid.position.y        = center.y;

          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.z);

          // PLY 크기에 비례한 노드/기즈모 스케일 (수평 범위의 약 1.5%)
          s.nodeScale = maxDim * 0.015;
          s.meshes.forEach(m => m.scale.setScalar(s.nodeScale));
          gizmo.scale.setScalar(s.nodeScale);

          // 카메라를 모델 위에서 바라보도록 재배치 (Y-up)
          camera.position.set(center.x, center.y + maxDim * 0.8, center.z + maxDim);
          orbit.update();
        },
        undefined,
        () => {},  // PLY 로드 실패 시 그냥 그리드만 사용
      );
    };

    // floor_id가 있으면 API에서 splat_path 조회 후 PLY 로드
    if (floorId) {
      fetch(`${API}/api/floors/${floorId}`)
        .then(r => r.ok ? r.json() : null)
        .then(floor => {
          if (floor?.splat_path) loadPly(floor.splat_path);
        })
        .catch(() => {});
    } else {
      loadPly('/Open3d.ply');
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      orbit.dispose();
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
      nodes: s.gNodes.map(({ id, name, type, x, y, z }) => ({
        id, name, type,
        x: +x.toFixed(4), y: +y.toFixed(4), z: +z.toFixed(4),
      })),
      edges: s.gEdges.map(({ id, from, to }) => ({ id, from, to })),
    };

    if (floorId) {
      setSaveStatus('saving');
      try {
        const res = await fetch(`${API}/api/navigation/floors/${floorId}/graph`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error();
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus(''), 2000);
      } catch {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } else {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = 'nav_graph.json'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const selNode = nodes.find(n => n.id === selId);

  // ─── 렌더 ────────────────────────────────────────────────────────────────
  return (
    <div className="navgraph-page">
      <header className="navgraph-header">
        <button className="navgraph-back-btn" onClick={onExit}>← 뒤로</button>
        <span className="navgraph-header-title">
          {floorLabel ? `그래프 에디터 — ${floorLabel}` : '내비게이션 그래프 에디터'}
        </span>
        <div className="navgraph-header-tips">
          <span><span style={{ color: '#ff6666' }}>■</span> X축</span>
          <span><span style={{ color: '#4488ff' }}>■</span> Z축</span>
          <span>좌클릭 선택/배치 · 우클릭 엣지 연결 · 좌드래그 이동 · 우드래그 시점전환</span>
        </div>
      </header>

      <div className="navgraph-body">
        <div ref={mountRef} className="navgraph-canvas" />

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
                : floorId ? '저장' : '저장 (JSON 다운로드)'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
