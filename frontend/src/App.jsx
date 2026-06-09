import { useState, useEffect, useCallback, useRef } from 'react';
import Viewer3D from './components/Viewer3D';
import SearchBar from './components/SearchBar';
import RoutePanel from './components/RoutePanel';
import InfoCards from './components/InfoCards';
import {
  fetchBuildings,
  fetchFloor,
  fetchFloors,
  fetchNavGraph,
  fetchNavPath,
  fetchSpace,
  floorPlyFileUrl,
  spacePlyFileUrl,
} from './utils/api';
import NAV_GRAPH from './data/navGraph.json';

const SEARCHABLE_NODE_TYPES = new Set(['start', 'destination', 'door']);

const getSearchableNodes = (nodes = []) => (
  nodes.filter(n => SEARCHABLE_NODE_TYPES.has(n.type))
);

const getLocalFloorModelUrls = (building, floor) => {
  if (!building || !floor) return [];
  /*
  const floorName = floor.floor_name || `${floor.floor_number}층`;
  */
  const base = `/models/buildings/${building.id}/floors/${floor.id}`;
  return [`${base}/model`, `${base}/model.ply`];
};

const isUsableModelResponse = (response) => {
  if (!response.ok) return false;
  const contentType = response.headers.get('content-type') || '';
  return !contentType.toLowerCase().includes('text/html');
};

const findPathInGraph = (graph, fromId, toId) => {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  if (!fromId || !toId || nodes.length === 0) return [];
  if (fromId === toId) return nodes.filter(n => n.id === fromId);

  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const adj = Object.fromEntries(nodes.map(n => [n.id, []]));
  edges.forEach(edge => {
    adj[edge.from]?.push(edge.to);
    adj[edge.to]?.push(edge.from);
  });

  const visited = new Set([fromId]);
  const queue = [[fromId]];

  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    for (const next of adj[current] ?? []) {
      if (visited.has(next)) continue;
      const nextPath = [...path, next];
      if (next === toId) return nextPath.map(id => nodeMap[id]).filter(Boolean);
      visited.add(next);
      queue.push(nextPath);
    }
  }

  return [];
};

export default function App({ onEnterAdmin, navGraph = NAV_GRAPH, initialNavigation = null }) {
  const [viewMode, setViewMode] = useState('3d');
  const baseNavGraph = navGraph || NAV_GRAPH;
  const appliedInitialNavigationRef = useRef(null);

  // 건물/층 선택
  const [buildings,          setBuildings]          = useState([]);
  const [floors,             setFloors]             = useState([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedFloorId,    setSelectedFloorId]    = useState(null);
  const [selectedFloor,      setSelectedFloor]      = useState(null);
  const [selectedModelUrl,   setSelectedModelUrl]   = useState(undefined);
  const [activeSpaceModel,   setActiveSpaceModel]   = useState(null);
  const [floorNavGraph,      setFloorNavGraph]      = useState(null);
  const activeNavGraph = selectedFloorId ? (floorNavGraph || baseNavGraph) : baseNavGraph;
  const selectedBuilding = buildings.find(b => b.id === selectedBuildingId) || null;

  // destination 타입 노드만 보관 (waypoint 등 제외)
  const [destinations, setDestinations] = useState([]);

  // 경로 선택 상태
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedDest,  setSelectedDest]  = useState(null);
  const [routePath,     setRoutePath]     = useState(null); // Node[]
  const [routeError,    setRouteError]    = useState('');

  // 거리뷰 카메라 이동 커맨드 { nodeId, seq }
  const [navCommand, setNavCommand] = useState(null);

  // ─── 데이터 로딩 ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetchBuildings().then(setBuildings).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedFloor(null);
    setSelectedModelUrl(undefined);
    setActiveSpaceModel(null);
    setFloorNavGraph(null);
    if (!selectedBuildingId) { setFloors([]); setSelectedFloorId(null); return; }
    fetchFloors(selectedBuildingId)
      .then(data => { setFloors(data); setSelectedFloorId(null); })
      .catch(() => {});
  }, [selectedBuildingId]);

  useEffect(() => {
    setSelectedFloor(null);
    setActiveSpaceModel(null);
    setFloorNavGraph(null);
    setSelectedStart(null);
    setSelectedDest(null);
    setRoutePath(null);
    setRouteError('');

    if (!selectedFloorId) {
      setDestinations(getSearchableNodes(baseNavGraph.nodes));
      return;
    }

    setDestinations([]);
    fetchFloor(selectedFloorId)
      .then(setSelectedFloor)
      .catch(() => setSelectedFloor(null));

    fetchNavGraph(selectedFloorId)
      .then(data => {
        const graph = data.graph ?? data;
        const nodes = graph.nodes ?? [];
        const dests = getSearchableNodes(nodes);
        if (nodes.length) setFloorNavGraph(graph);
        // API에 노드가 없으면 목업으로 fallback
        setDestinations(dests.length ? dests : getSearchableNodes(baseNavGraph.nodes));
      })
      .catch(() => setDestinations(getSearchableNodes(baseNavGraph.nodes)));
  }, [selectedFloorId, baseNavGraph]);

  useEffect(() => {
    let cancelled = false;
    const fallbackUrl = selectedFloor?.splat_path
      ? floorPlyFileUrl(selectedFloor.id)
      : selectedFloor?.ply_url || undefined;
    const localUrls = getLocalFloorModelUrls(selectedBuilding, selectedFloor);

    if (localUrls.length === 0) {
      setSelectedModelUrl(fallbackUrl);
      return () => { cancelled = true; };
    }

    (async () => {
      for (const localUrl of localUrls) {
        try {
          const response = await fetch(localUrl, { method: 'HEAD' });
          if (isUsableModelResponse(response)) {
            if (!cancelled) setSelectedModelUrl(localUrl);
            return;
          }
        } catch {}
      }
      if (!cancelled) setSelectedModelUrl(fallbackUrl);
    })();

    return () => { cancelled = true; };
  }, [selectedBuilding, selectedFloor]);

  const handleNodeActivate = useCallback((node) => {
    const spaceId = node?.target_space_id;
    if (!spaceId) return;
    fetchSpace(spaceId)
      .then((space) => {
        if (!space?.splat_path) {
          window.alert('연결된 공간에 등록된 PLY 모델이 없습니다.');
          return;
        }
        setActiveSpaceModel({
          id: space.id,
          name: space.name || node.name || `Space ${space.id}`,
          splat_path: spacePlyFileUrl(space.id),
        });
      })
      .catch(() => window.alert('연결된 공간 정보를 불러오지 못했습니다.'));
  }, []);

  useEffect(() => {
    if (!initialNavigation?.startNodeId) return;
    if (appliedInitialNavigationRef.current === initialNavigation.seq) return;

    const startNode = activeNavGraph.nodes?.find(node => node.id === initialNavigation.startNodeId);
    if (!startNode) return;

    appliedInitialNavigationRef.current = initialNavigation.seq;
    setViewMode('3d');
    setSelectedStart(startNode);
    setSelectedDest(null);
    setRoutePath(null);
    setRouteError('');
    setNavCommand({ nodeId: startNode.id, seq: initialNavigation.seq });
  }, [activeNavGraph, initialNavigation]);

  // 출발지·목적지 모두 선택되면 경로 조회
  useEffect(() => {
    if (!selectedStart || !selectedDest) {
      setRoutePath(null);
      setRouteError('');
      return;
    }

    if (!selectedFloorId) {
      const path = findPathInGraph(activeNavGraph, selectedStart.id, selectedDest.id);
      if (path.length) { setRoutePath(path); setRouteError(''); }
      else { setRoutePath(null); setRouteError('경로를 찾을 수 없습니다.'); }
      return;
    }

    fetchNavPath(selectedFloorId, selectedStart.id, selectedDest.id)
      .then(data => {
        const path = data.path ?? [];
        if (path.length) { setRoutePath(path); setRouteError(''); }
        else { setRoutePath(null); setRouteError('경로를 찾을 수 없습니다.'); }
      })
      .catch(() => setRouteError('경로 조회에 실패했습니다.'));
  }, [selectedFloorId, selectedStart, selectedDest, activeNavGraph]);

  // ─── 핸들러 ───────────────────────────────────────────────────────────────

  const handleSelectStart = useCallback((node) => {
    setSelectedStart(node);
    setRoutePath(null);
    setRouteError('');
  }, []);

  const handleSelectDest = useCallback((node) => {
    setSelectedDest(node);
    setRoutePath(null);
    setRouteError('');
  }, []);

  const handleClearStart = useCallback(() => {
    setSelectedStart(null);
    setRoutePath(null);
    setRouteError('');
  }, []);

  const handleClearDest = useCallback(() => {
    setSelectedDest(null);
    setRoutePath(null);
    setRouteError('');
  }, []);

  const viewerModelUrl = activeSpaceModel?.splat_path
    || selectedModelUrl
    || initialNavigation?.modelUrl;

  const handleBuildingChange = (e) => {
    setSelectedBuildingId(Number(e.target.value) || null);
  };

  const handleFloorChange = (e) => {
    setSelectedFloorId(Number(e.target.value) || null);
  };

  const routeSteps = routePath?.map(n => n.name).filter(Boolean) ?? null;

  // ─── 렌더 ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* 헤더 */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">DT</div>
          <h1 className="app-title">디지털 트윈 건물 안내 맵</h1>
        </div>
        {onEnterAdmin && (
          <button className="admin-entry-btn" onClick={onEnterAdmin}>
            ⚙ 관리자
          </button>
        )}
      </header>

      {/* 컨트롤 바 */}
      <div className="controls-bar">
        {/* 건물 / 층 선택 */}
        <div className="controls-selectors">
          <select
            className="floor-select"
            value={selectedBuildingId || ''}
            onChange={handleBuildingChange}
          >
            <option value="">건물 선택</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            className="floor-select"
            value={selectedFloorId || ''}
            onChange={handleFloorChange}
            disabled={!selectedBuildingId || floors.length === 0}
          >
            <option value="">층 선택</option>
            {floors.map(f => (
              <option key={f.id} value={f.id}>{f.floor_name || f.floor_number + '층'}</option>
            ))}
          </select>
        </div>

        {/* 출발지 / 목적지 검색 */}
        <SearchBar
          nodes={destinations}
          label="출발지 검색"
          selected={selectedStart}
          onSelect={handleSelectStart}
          onClear={handleClearStart}
        />
        <SearchBar
          nodes={destinations}
          label="목적지 검색"
          selected={selectedDest}
          onSelect={handleSelectDest}
          onClear={handleClearDest}
        />

        {routeError && (
          <div style={{ color: 'var(--color-danger, #e53e3e)', fontSize: 13, marginTop: 4 }}>
            {routeError}
          </div>
        )}

        {/* 안내 시작 버튼 */}
        {selectedStart && selectedDest && (
          <button
            onClick={() => setNavCommand({ nodeId: selectedStart.id, seq: Date.now() })}
            style={{
              marginTop: 8, padding: '8px 20px',
              background: 'var(--color-primary, #3b82f6)',
              color: '#fff', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
              width: '100%',
            }}
          >
            안내 시작
          </button>
        )}
      </div>

      <div className="navigation-workspace">
        {/* 뷰어 */}
          <div className="viewer-grid single" style={{ position: 'relative' }}>
          {viewMode === '3d' && (
            <Viewer3D
              key={`${selectedFloorId || initialNavigation?.targetId || 'local'}:${viewerModelUrl || 'default'}`}
              selectedDest={selectedDest}
              routePoints={routePath}
              navGraph={activeNavGraph}
              navCommand={navCommand}
              initialViewMode={initialNavigation?.startNodeId ? 'pedestrian' : 'orbit'}
              modelUrl={viewerModelUrl}
              onNodeActivate={handleNodeActivate}
            />
          )}
          {activeSpaceModel && (
            <button
              type="button"
              onClick={() => setActiveSpaceModel(null)}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 4,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.24)',
                background: 'rgba(12,12,12,0.82)',
                color: '#fff',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              층 모델로 돌아가기
            </button>
          )}
        </div>

        <aside className="navigation-sidebar">
          <InfoCards
            currentLocation={selectedStart?.name}
            destination={selectedDest?.name}
          />

          <div className="route-panel-wrap">
            {routeSteps && <RoutePanel steps={routeSteps} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
