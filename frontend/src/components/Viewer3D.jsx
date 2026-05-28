import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export default function Viewer3D({ selectedDest, routePoints, navGraph, navCommand }) {
  const containerRef    = useRef(null);
  const threeRef        = useRef(null); // { scene, plyOffset, renderer }
  const cameraRef       = useRef(null);
  const controlsRef     = useRef(null);
  const routeGroupRef   = useRef(null);
  const navGraphRef     = useRef(null); // Three.js group (visual)
  const svArrowsRef     = useRef(null); // 거리뷰 바닥 화살표 그룹
  const navGraphDataRef = useRef(navGraph); // 이벤트 핸들러용 최신 navGraph

  // 거리뷰 이동 상태 (React state 아닌 ref — 매 프레임마다 쓰임)
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
  const [svNodeId, setSvNodeId] = useState(null); // 현재 노드 (화살표 재렌더 트리거)

  useEffect(() => { navGraphDataRef.current = navGraph; }, [navGraph]);

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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const plyOffset = new THREE.Vector3();
    threeRef.current = { scene, plyOffset, renderer };

    new PLYLoader().load(
      '/Open3d.ply',
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        plyOffset.copy(center);
        geometry.translate(-center.x, -center.y, -center.z);

        scene.add(new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            vertexColors: geometry.hasAttribute('color'),
            ...(geometry.hasAttribute('color') ? {} : { color: 0x88ccff }),
            side: THREE.DoubleSide,
          }),
        ));

        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 1.0);
        dir.position.set(5, 10, 5);
        scene.add(dir);

        const box  = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3()).length();
        svRef.current.eyeHeight = size * 0.06;
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

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // 거리뷰 이동 보간
      const sv = svRef.current;
      if (sv.active && sv.transitioning) {
        sv.progress = Math.min(sv.progress + 0.035, 1);
        const t = sv.progress * sv.progress * (3 - 2 * sv.progress); // smoothstep
        camera.position.lerpVectors(sv.fromPos, sv.toPos, t);
        controls.target.lerpVectors(sv.fromTarget, sv.toTarget, t);

        if (sv.progress >= 1) {
          sv.transitioning = false;
          controls.enabled = true;
          setSvNodeId(sv.nextNodeId);
        }
      }

      // 화살표 펄스 애니메이션
      if (svArrowsRef.current) {
        const pulse = 0.85 + Math.sin(Date.now() * 0.004) * 0.15;
        svArrowsRef.current.traverse(obj => {
          if (obj.userData.isPulse) obj.scale.setScalar(pulse);
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
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
    const off = t.plyOffset;
    const pos = new THREE.Vector3(randomNode.x - off.x, randomNode.y - off.y, randomNode.z - off.z);
    const eyeH = svRef.current.eyeHeight;

    camera.position.set(pos.x, pos.y + eyeH, pos.z);
    controls.target.copy(pos);
    controls.minDistance = eyeH;
    controls.maxDistance = eyeH;
    controls.enablePan = false;
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

    const off = t.plyOffset;
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
  }, [navCommand]);

  // ─── navGraph 시각화 ─────────────────────────────────────────────────────
  useEffect(() => {
    const t = threeRef.current;
    if (!t || !navGraph) return;

    if (navGraphRef.current) {
      t.scene.remove(navGraphRef.current);
      navGraphRef.current.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
      navGraphRef.current = null;
    }

    const { nodes, edges } = navGraph;
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const off = t.plyOffset;
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);

    const group = new THREE.Group();

    edges.forEach(e => {
      const a = nodeMap[e.from], b = nodeMap[e.to];
      if (!a || !b) return;
      const geo = new THREE.BufferGeometry().setFromPoints([toV(a), toV(b)]);
      group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x3b82f6 })));
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
    });

    t.scene.add(group);
    navGraphRef.current = group;
  }, [navGraph, status]);

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

    const off = t.plyOffset;
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
  }, [routePoints]);

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

    const off = t.plyOffset;
    const toV = (n) => new THREE.Vector3(n.x - off.x, n.y - off.y, n.z - off.z);
    const curPos = toV(curNode);

    const group = new THREE.Group();
    group.name = 'sv-arrows';

    adjIds.forEach(id => {
      const adjNode = nodeMap[id];
      if (!adjNode) return;
      const adjPos = toV(adjNode);

      const dir = new THREE.Vector3(adjPos.x - curPos.x, 0, adjPos.z - curPos.z).normalize();

      // 현재 노드에서 약간 앞쪽 바닥에 화살표 배치
      const arrowPos = new THREE.Vector3(
        curPos.x + dir.x * 0.06,
        curPos.y,
        curPos.z + dir.z * 0.06,
      );

      // 바닥 원형 베이스 (글로우 효과용)
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.03, 20),
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9, transparent: true, opacity: 0.35,
          depthTest: false, side: THREE.DoubleSide,
        }),
      );
      disc.position.copy(arrowPos);
      disc.rotation.x = -Math.PI / 2;
      disc.renderOrder = 5;
      disc.userData.isPulse   = true;
      disc.userData.isSvArrow = true;
      disc.userData.nodeId    = id;
      group.add(disc);

      // 삼각 화살표 (ConeGeometry 3면 = 삼각형)
      // 기본축 (0,1,0) → 수평 진행 방향으로 회전 → 바닥에 납작하게 눕힘
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.018, 0.045, 3),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, depthTest: false }),
      );
      cone.position.copy(arrowPos);
      cone.renderOrder = 6;
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.userData.isSvArrow = true;
      cone.userData.nodeId    = id;
      group.add(cone);
    });

    t.scene.add(group);
    svArrowsRef.current = group;

    return cleanup;
  }, [navGraph, svNodeId, status]);

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

      const off = t.plyOffset;
      const newTarget = new THREE.Vector3(node.x - off.x, node.y - off.y, node.z - off.z);
      const eyeH = svRef.current.eyeHeight;

      // 현재 시선 방향 유지 (크기 = eyeH 고정)
      const offset = new THREE.Vector3()
        .subVectors(camera.position, controls.target)
        .normalize()
        .multiplyScalar(eyeH);

      const sv = svRef.current;
      sv.fromPos.copy(camera.position);
      sv.fromTarget.copy(controls.target);
      sv.toTarget.copy(newTarget);
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
