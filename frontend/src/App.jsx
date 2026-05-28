import { useState, useEffect, useCallback } from 'react';
import Viewer3D from './components/Viewer3D';
import SearchBar from './components/SearchBar';
import RoutePanel from './components/RoutePanel';
import InfoCards from './components/InfoCards';
import { fetchBuildings, fetchFloors, fetchNavGraph, fetchNavPath } from './utils/api';
import { MOCK_DESTINATIONS, findMockPath } from './data/mockNavGraph';
import NAV_GRAPH from './data/navGraph.json';

export default function App({ onEnterAdmin }) {
  const [viewMode, setViewMode] = useState('3d');

  // 건물/층 선택
  const [buildings,          setBuildings]          = useState([]);
  const [floors,             setFloors]             = useState([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedFloorId,    setSelectedFloorId]    = useState(null);

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
    if (!selectedBuildingId) { setFloors([]); setSelectedFloorId(null); return; }
    fetchFloors(selectedBuildingId)
      .then(data => { setFloors(data); setSelectedFloorId(null); })
      .catch(() => {});
  }, [selectedBuildingId]);

  useEffect(() => {
    setSelectedStart(null);
    setSelectedDest(null);
    setRoutePath(null);
    setRouteError('');

    if (!selectedFloorId) {
      // 층 미선택 → 목업 데이터 사용
      setDestinations(MOCK_DESTINATIONS);
      return;
    }

    setDestinations([]);
    fetchNavGraph(selectedFloorId)
      .then(data => {
        const nodes = data.graph?.nodes ?? data.nodes ?? [];
        const dests = nodes.filter(n => n.type === 'destination');
        // API에 노드가 없으면 목업으로 fallback
        setDestinations(dests.length ? dests : MOCK_DESTINATIONS);
      })
      .catch(() => setDestinations(MOCK_DESTINATIONS));
  }, [selectedFloorId]);

  // 출발지·목적지 모두 선택되면 경로 조회
  useEffect(() => {
    if (!selectedStart || !selectedDest) {
      setRoutePath(null);
      setRouteError('');
      return;
    }

    if (!selectedFloorId) {
      // 목업 BFS 경로
      const path = findMockPath(selectedStart.id, selectedDest.id);
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
  }, [selectedFloorId, selectedStart, selectedDest]);

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

  const handleBuildingChange = (e) => {
    setSelectedBuildingId(Number(e.target.value) || null);
  };

  const handleFloorChange = (e) => {
    setSelectedFloorId(Number(e.target.value) || null);
  };

  // RoutePanel은 문자열 배열을 받으므로 경로 노드 이름으로 변환
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

      {/* 뷰어 */}
      <div className="viewer-grid single">
        {viewMode === '3d' && (
          <Viewer3D
            selectedDest={selectedDest}
            routePoints={routePath}
            navGraph={NAV_GRAPH}
            navCommand={navCommand}
          />
        )}
      </div>

      {/* 정보 카드 */}
      <InfoCards
        currentLocation={selectedStart?.name}
        destination={selectedDest?.name}
        estimatedTime={null}
      />

      {/* 경로 안내 패널 */}
      {routeSteps && <RoutePanel steps={routeSteps} />}
    </div>
  );
}