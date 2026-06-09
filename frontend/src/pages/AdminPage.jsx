import { useState, useEffect } from 'react';
import '../styles/admin.css';
import {
  createBuilding,
  createFloor,
  createSpace,
  deleteBuilding,
  deleteFloor,
  deleteSpace,
  describeApiError,
  fetchBuildings,
  fetchFloors,
  fetchSpaces,
  updateBuilding,
  updateFloor,
  uploadFloorPly,
  uploadSpacePly,
} from '../utils/api';

const DEFAULT_COMPLETED_SPLAT_PATH = '/Open3d.ply';

// ─── 아이콘 컴포넌트 (SVG) ───────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    dashboard: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
      </svg>
    ),
    upload: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    ),
    cube: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
      </svg>
    ),
    map: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
        <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
      </svg>
    ),
    settings: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M19.07 19.07l-1.41-1.41M4.93 19.07l1.41-1.41M12 2v2M12 20v2M2 12h2M20 12h2"/>
      </svg>
    ),
    arrow: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
      </svg>
    ),
    check: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    video: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    ),
    link: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
    ),
    trash: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
      </svg>
    ),
    eye: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
    ),
    plus: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    ),
    building: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/>
        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>
      </svg>
    ),
    alert: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    network: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/>
        <line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/>
        <line x1="7" y1="19" x2="17" y2="19"/>
      </svg>
    ),
    layers: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    ),
    pencil: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    ),
  };
  return icons[name] || null;
};

// ─── 더미 데이터 ─────────────────────────────────────────────────────
const DUMMY_MODELS = [
  { id: 1, name: '공학관 1층', status: 'done', floor: 1, date: '2025-03-15', duration: '2h 14m', size: '2.3GB', linked: true },
  { id: 2, name: '공학관 2층', status: 'done', floor: 2, date: '2025-03-16', duration: '1h 58m', size: '1.9GB', linked: false },
  { id: 3, name: '공학관 3층', status: 'processing', floor: 3, date: '2025-03-18', duration: null, size: '2.1GB', linked: false },
  { id: 4, name: '도서관 로비', status: 'error', floor: 1, date: '2025-03-17', duration: null, size: '1.2GB', linked: false },
];

const STATUS_LABEL = {
  done: '완료',
  processing: '처리중',
  error: '오류',
  queued: '대기중',
  completed: '완료',
  failed: '실패',
};
const STATUS_CLASS = {
  done: 'status-done',
  processing: 'status-processing',
  error: 'status-error',
  queued: 'status-processing',
  completed: 'status-done',
  failed: 'status-error',
};

// ─── 목업 데이터 (API 연결 전 fallback) ──────────────────────────────
// API 필드명과 동일하게 유지: building_id, floor_number, floor_name
const DUMMY_BUILDINGS = [];
const DUMMY_FLOORS = [];

const UNUSED_DUMMY_BUILDINGS = [
  { id: 1, name: '공학관',   address: '서울시 광진구 능동로 120', description: '공과대학 메인 건물' },
  { id: 2, name: '도서관',   address: '서울시 광진구 능동로 120', description: '중앙도서관' },
  { id: 3, name: '학생회관', address: '서울시 광진구 능동로 120', description: '학생 편의시설' },
  { id: 4, name: '본관',     address: '서울시 광진구 능동로 120', description: '행정 및 강의동' },
];

const UNUSED_DUMMY_FLOORS = [
  { id:  1, building_id: 1, floor_number: -1, floor_name: 'B1 (지하 1층)' },
  { id:  2, building_id: 1, floor_number:  1, floor_name: '1층 (로비·실험실)' },
  { id:  3, building_id: 1, floor_number:  2, floor_name: '2층 (강의실)' },
  { id:  4, building_id: 1, floor_number:  3, floor_name: '3층 (강의실)' },
  { id:  5, building_id: 1, floor_number:  4, floor_name: '4층 (교수 연구실)' },
  { id:  6, building_id: 1, floor_number:  5, floor_name: '5층 (대학원)' },
  { id:  7, building_id: 2, floor_number:  1, floor_name: '1층 (열람실·안내)' },
  { id:  8, building_id: 2, floor_number:  2, floor_name: '2층 (자료실)' },
  { id:  9, building_id: 2, floor_number:  3, floor_name: '3층 (디지털 자료실)' },
  { id: 10, building_id: 2, floor_number:  4, floor_name: '4층 (세미나실)' },
  { id: 11, building_id: 3, floor_number:  1, floor_name: '1층 (식당·편의점)' },
  { id: 12, building_id: 3, floor_number:  2, floor_name: '2층 (동아리실)' },
  { id: 13, building_id: 3, floor_number:  3, floor_name: '3층 (회의실)' },
  { id: 14, building_id: 4, floor_number:  1, floor_name: '1층 (원무과·행정)' },
  { id: 15, building_id: 4, floor_number:  2, floor_name: '2층 (강의실)' },
  { id: 16, building_id: 4, floor_number:  3, floor_name: '3층 (강의실)' },
  { id: 17, building_id: 4, floor_number:  4, floor_name: '4층 (총장실·부속실)' },
];

// ─── 대시보드 ─────────────────────────────────────────────────────────
function Dashboard({ onNavigate, onOpenEditor }) {
  const stats = [
    { label: '등록된 공간', value: '4', sub: '3개 건물', color: 'var(--admin-primary)' },
    { label: '처리 완료', value: '2', sub: '이번 달', color: 'var(--admin-success)' },
    { label: '처리 중', value: '1', sub: '예상 23분', color: 'var(--admin-warning)' },
    { label: '오류', value: '1', sub: '확인 필요', color: 'var(--admin-danger)' },
  ];

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">대시보드</h2>
          <p className="admin-page-sub">전체 현황을 확인하세요</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-primary" onClick={() => onNavigate('upload')}>
            <Icon name="plus" size={16} />
            새 영상 업로드
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="admin-stat-grid">
        {stats.map((s) => (
          <div className="admin-stat-card" key={s.label}>
            <div className="admin-stat-bar" style={{ background: s.color }} />
            <div className="admin-stat-body">
              <span className="admin-stat-label">{s.label}</span>
              <div className="admin-stat-value">{s.value}</div>
              <span className="admin-stat-sub">{s.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 모델 */}
      <div className="admin-section">
        <div className="admin-section-header">
          <h3 className="admin-section-title">최근 등록 모델</h3>
          <button className="admin-text-btn" onClick={() => onNavigate('models')}>전체 보기 →</button>
        </div>
        <ModelTable models={DUMMY_MODELS.slice(0, 3)} onNavigate={onNavigate} />
      </div>

    </div>
  );
}

// ─── 모델 테이블 ──────────────────────────────────────────────────────
function ModelTable({ models, onNavigate }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>공간 이름</th>
            <th>층</th>
            <th>상태</th>
            {/* <th>도면 연동</th> */}
            <th>등록일</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <td>
                <div className="admin-table-name">
                  <Icon name="cube" size={15} />
                  {m.name}
                </div>
              </td>
              <td><span className="admin-floor-badge">{m.floor}F</span></td>
              <td>
                <span className={`admin-status-badge ${STATUS_CLASS[m.status]}`}>
                  {m.status === 'processing' && <span className="admin-spinner-dot" />}
                  {STATUS_LABEL[m.status]}
                </span>
              </td>
              {/* <td>
                {m.linked
                  ? <span className="admin-linked-badge">연동됨</span>
                  : <button className="admin-text-btn" onClick={() => onNavigate('floorplan')}>연동하기</button>
                }
              </td> */}
              <td className="admin-table-muted">{m.date}</td>
              <td>
                <div className="admin-table-actions">
                  <button className="admin-icon-btn" title="미리보기"><Icon name="eye" size={15} /></button>
                  {/* <button className="admin-icon-btn" title="도면 연동" onClick={() => onNavigate('floorplan')}><Icon name="link" size={15} /></button> */}
                  <button className="admin-icon-btn admin-icon-btn-danger" title="삭제"><Icon name="trash" size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 업로드 위자드 ────────────────────────────────────────────────────
const STEPS = ['기본 정보', '영상 선택', '처리 설정', '검토 및 시작'];

function UploadWizard({ onCompleted }) {
  // ── 상태 (문서 명세: VideoUploadPage attributes) ──────────────────
  const [step, setStep] = useState(1);                          // currentStep: int (1~4)
  const [file, setFile] = useState(null);                       // selectedFile: File
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [apiBuildingList, setApiBuildingList] = useState([]);
  const [apiFloorList, setApiFloorList] = useState([]);
  const [spaceName, setSpaceName] = useState('');
  const [processingQuality, setProcessingQuality] = useState('fast'); // fast/standard/high (API 값)
  const [iterations, setIterations] = useState(30000);
  const [dragOver, setDragOver] = useState(false);
  const [started, setStarted] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(''); // queued|processing|completed|failed
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

  // ── 메서드 (문서 명세: VideoUploadPage methods) ───────────────────

  useEffect(() => {
    fetchBuildings().then(setApiBuildingList).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedBuildingId) { setApiFloorList([]); return; }
    fetchFloors(selectedBuildingId).then(setApiFloorList).catch(() => {});
  }, [selectedBuildingId]);

  /** 파일 형식·크기 검증 (기본 흐름 5) */
  const validateFile = (f) => {
    if (!f) return false;
    if (f.size > MAX_FILE_SIZE) {
      showErrorMessage('파일 크기가 500MB를 초과합니다.');
      return false;
    }
    if (!f.type.startsWith('video/') && !f.name.endsWith('.mkv')) {
      showErrorMessage('지원하지 않는 파일 형식입니다. (MP4, MOV, AVI, MKV)');
      return false;
    }
    return true;
  };

  /** 처리 품질 및 Iterations 설정 (기본 흐름 6) */
  const setProcessingOptions = (inQuality, inIterations) => {
    setProcessingQuality(inQuality);
    setIterations(inIterations);
  };

  /** 대안 흐름 오류 메시지 표시 */
  const showErrorMessage = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  };

  const submitUpload = async () => {
    if (!file || !selectedBuildingId || !selectedFloorId) return;
    setStarted(true);
    setJobStatus('processing');
    setProgress(0);

    const completedFloor = {
      ...selectedFloor,
      status: 'completed',
      splat_path: selectedFloor?.splat_path || DEFAULT_COMPLETED_SPLAT_PATH,
    };
    setApiFloorList((items) => items.map((floor) => (
      floor.id === selectedFloorId ? { ...floor, ...completedFloor } : floor
    )));
    setJobId(`local-${selectedFloorId}`);
    onCompleted?.({
      buildingId: selectedBuildingId,
      floorId: selectedFloorId,
      floor: completedFloor,
    });

    try {
      await updateFloor(selectedFloorId, {
        status: 'completed',
        splat_path: completedFloor.splat_path,
        floor_name: selectedFloor?.floor_name || spaceName.trim() || null,
      });
    } catch (err) {
      showErrorMessage('서버 저장은 실패했지만, 현재 화면에서는 완료된 층으로 처리했습니다.');
    }
  };

  // ── 이벤트 핸들러 ────────────────────────────────────────────────
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && validateFile(f)) setFile(f);
  };

  const handleFileInput = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (validateFile(f)) setFile(f);
    else e.target.value = '';
  };

  const handleBuildingChange = (e) => {
    setSelectedBuildingId(Number(e.target.value) || null);
    setSelectedFloorId(null);
  };

  // ── 파생 데이터 ──────────────────────────────────────────────────
  const buildings = apiBuildingList.length > 0 ? apiBuildingList : DUMMY_BUILDINGS;
  const floors = apiFloorList.length > 0 ? apiFloorList
    : selectedBuildingId ? DUMMY_FLOORS.filter((f) => f.building_id === selectedBuildingId) : [];
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const selectedFloor = floors.find((f) => f.id === selectedFloorId);

  const qualityOptions = [
    { key: 'fast',     label: '빠른 처리', sub: '저품질 · 약 30분',    icon: '⚡' },
    { key: 'standard', label: '표준',      sub: '권장 품질 · 약 2시간', icon: '◉' },
    { key: 'high',     label: '고품질',    sub: '최고 품질 · 약 6시간', icon: '◈' },
  ];

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">새 영상 업로드</h2>
          <p className="admin-page-sub">영상을 업로드하고 3D 모델로 변환하세요</p>
        </div>
      </div>

      {/* 오류 메시지 배너 */}
      {errorMsg && (
        <div className="admin-tip" style={{ background: 'var(--admin-danger-bg, #fff0f0)', borderColor: 'var(--admin-danger, #e53e3e)', marginBottom: 12 }}>
          <Icon name="alert" size={15} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 스텝 인디케이터 */}
      <div className="admin-steps">
        {STEPS.map((s, i) => (
          <div key={s} className={`admin-step ${i + 1 === step ? 'active' : i + 1 < step ? 'done' : ''}`}>
            <div className="admin-step-circle">
              {i + 1 < step ? <Icon name="check" size={13} /> : i + 1}
            </div>
            <span className="admin-step-label">{s}</span>
            {i < STEPS.length - 1 && <div className="admin-step-line" />}
          </div>
        ))}
      </div>

      {/* 스텝 콘텐츠 */}
      <div className="admin-wizard-body">

        {/* ── Step 1: 기본 정보 ── */}
        {step === 1 && (
          <div className="admin-form-grid">
            <div className="admin-form-group admin-form-full">
              <label className="admin-label">공간 이름 <span className="admin-required">*</span></label>
              <input className="admin-input" value={spaceName}
                onChange={e => setSpaceName(e.target.value)}
                placeholder="예: 101호 강의실, 로비" />
            </div>
            <div className="admin-form-group admin-form-full">
              <label className="admin-label">건물 선택 <span className="admin-required">*</span></label>
              <select
                className="admin-select"
                value={selectedBuildingId || ''}
                onChange={handleBuildingChange}
              >
                <option value="">건물을 선택하세요</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-label">층 선택 <span className="admin-required">*</span></label>
              <select
                className="admin-select"
                value={selectedFloorId || ''}
                onChange={(e) => setSelectedFloorId(Number(e.target.value) || null)}
                disabled={!selectedBuildingId}
              >
                <option value="">층을 선택하세요</option>
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>{f.floor_name || f.floor_number + '층'}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── Step 2: 영상 선택 ── */}
        {step === 2 && (
          <div>
            <div
              className={`admin-dropzone ${dragOver ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !file && document.getElementById('file-input').click()}
            >
              {!file ? (
                <>
                  <div className="admin-dropzone-icon"><Icon name="video" size={36} /></div>
                  <div className="admin-dropzone-title">영상 파일을 드래그하거나 클릭해서 선택</div>
                  <div className="admin-dropzone-sub">MP4, MOV, AVI, MKV · 최대 500MB</div>
                  <button className="admin-btn admin-btn-outline" style={{ marginTop: 16 }}
                    onClick={(e) => { e.stopPropagation(); document.getElementById('file-input').click(); }}>
                    파일 선택
                  </button>
                </>
              ) : (
                <div className="admin-file-selected">
                  <div className="admin-file-icon"><Icon name="video" size={28} /></div>
                  <div className="admin-file-info">
                    <div className="admin-file-name">{file.name}</div>
                    <div className="admin-file-size">{(file.size / 1024 / 1024).toFixed(1)} MB</div>
                  </div>
                  <button className="admin-icon-btn admin-icon-btn-danger" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              )}
              <input id="file-input" type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mkv" style={{ display: 'none' }} onChange={handleFileInput} />
            </div>

            <div className="admin-tip">
              <Icon name="alert" size={15} />
              <span>촬영 팁: 이동 속도를 일정하게 유지하고, 겹치는 구간이 30% 이상 되도록 촬영하면 더 정확한 3D 모델을 얻을 수 있습니다.</span>
            </div>
          </div>
        )}

        {/* ── Step 3: 처리 설정 ── */}
        {step === 3 && (
          <div>
            {/* 품질 선택 */}
            <div className="admin-form-group" style={{ marginBottom: 24 }}>
              <label className="admin-label">처리 품질</label>
              <div className="admin-quality-grid">
                {qualityOptions.map((q) => (
                  <div
                    key={q.key}
                    className={`admin-quality-card ${processingQuality === q.key ? 'selected' : ''}`}
                    onClick={() => setProcessingOptions(q.key, iterations)}
                  >
                    <div className="admin-quality-icon">{q.icon}</div>
                    <div className="admin-quality-label">{q.label}</div>
                    <div className="admin-quality-sub">{q.sub}</div>
                    {processingQuality === q.key && <div className="admin-quality-check"><Icon name="check" size={12} /></div>}
                  </div>
                ))}
              </div>
            </div>

            {/* 고급 설정 */}
            <div className="admin-form-group">
              <label className="admin-label">고급 설정</label>
              <div className="admin-form-group">
                <label className="admin-label-sm">학습 반복 횟수 (Iterations)</label>
                <input className="admin-input" type="number" value={iterations}
                  onChange={(e) => setProcessingOptions(processingQuality, Number(e.target.value))} />
                <span className="admin-hint">기본값: 30,000 · 높을수록 정밀하지만 오래 걸림</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 4: 검토 및 시작 ── */}
        {step === 4 && (
          <div>
            {!started ? (
              <>
                <div className="admin-review-grid">
                  <div className="admin-review-card">
                    <div className="admin-review-section-title">
                      <Icon name="video" size={15} /> 영상 파일
                    </div>
                    <div className="admin-review-row">
                      <span>파일명</span><span>{file?.name || '파일 없음'}</span>
                    </div>
                    <div className="admin-review-row">
                      <span>크기</span><span>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '-'}</span>
                    </div>
                  </div>
                  <div className="admin-review-card">
                    <div className="admin-review-section-title">
                      <Icon name="building" size={15} /> 기본 정보
                    </div>
                    <div className="admin-review-row">
                      <span>공간 이름</span><span>{spaceName || '(미입력)'}</span>
                    </div>
                    <div className="admin-review-row">
                      <span>건물</span><span>{selectedBuilding?.name || '(미선택)'}</span>
                    </div>
                    <div className="admin-review-row">
                      <span>층</span><span>{selectedFloor ? (selectedFloor.floor_name || selectedFloor.floor_number + '층') : '(미선택)'}</span>
                    </div>
                  </div>
                  <div className="admin-review-card">
                    <div className="admin-review-section-title">
                      <Icon name="settings" size={15} /> 처리 설정
                    </div>
                    <div className="admin-review-row">
                      <span>품질</span>
                      <span>{qualityOptions.find((q) => q.key === processingQuality)?.label}</span>
                    </div>
                    <div className="admin-review-row">
                      <span>Iterations</span><span>{iterations.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
                <div className="admin-review-estimate">
                  <Icon name="alert" size={16} />
                  <span>예상 처리 시간: <strong>{qualityOptions.find((q) => q.key === processingQuality)?.sub.split('·')[1]?.trim()}</strong> · 처리 중에 웹을 종료해도 됩니다.</span>
                </div>
                <button className="admin-btn admin-btn-primary admin-btn-lg" onClick={submitUpload}>
                  3D 변환 시작
                </button>
              </>
            ) : (
              <div className="admin-processing-view">
                {jobStatus === 'completed' ? (
                  <div className="admin-processing-anim" style={{ fontSize: 48 }}>✓</div>
                ) : jobStatus === 'failed' ? (
                  <div className="admin-processing-anim" style={{ fontSize: 48, color: 'var(--admin-danger)' }}>✕</div>
                ) : (
                  <div className="admin-processing-anim"><div className="admin-cube-spin">◈</div></div>
                )}
                <h3 className="admin-processing-title">
                  {jobStatus === 'uploading'  ? '영상 업로드 중...'
                  : jobStatus === 'queued'    ? '변환 대기 중...'
                  : jobStatus === 'processing' ? '3D 모델 생성 중...'
                  : jobStatus === 'completed' ? '변환 완료!'
                  : jobStatus === 'failed'    ? '변환 실패'
                  : '처리 중...'}
                </h3>
                <p className="admin-processing-desc">
                  {jobStatus === 'completed'
                    ? '3D 모델이 성공적으로 생성되었습니다.'
                    : jobStatus === 'failed'
                    ? errorMsg || '변환 중 오류가 발생했습니다.'
                    : <>Gaussian Splatting 알고리즘으로 영상을 처리하고 있습니다.<br />페이지를 닫아도 처리는 계속됩니다.</>}
                </p>
                {jobId && (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
                    Job ID: {jobId}
                  </p>
                )}
                <div className="admin-progress-bar admin-progress-lg">
                  <div className="admin-progress-fill" style={{ width: `${progress}%`, transition: 'width 0.5s ease' }} />
                </div>
                <div className="admin-progress-info">
                  <span>{progress}% 완료</span>
                  <span style={{ textTransform: 'capitalize' }}>{jobStatus}</span>
                </div>
                <div className="admin-processing-log">
                  {['uploading','queued','processing','completed','failed'].some(s => jobStatus === s) &&
                    <div className="admin-log-line">✓ 영상 파일 업로드 완료</div>}
                  {['queued','processing','completed','failed'].some(s => jobStatus === s) &&
                    <div className="admin-log-line">✓ 변환 작업 등록됨 (Job #{jobId})</div>}
                  {['processing','completed'].some(s => jobStatus === s) &&
                    <div className={`admin-log-line ${jobStatus === 'processing' ? 'anim' : ''}`}>
                      {jobStatus === 'completed' ? '✓' : '⟳'} 3DGS 학습 중 (Colab)...
                    </div>}
                  {jobStatus === 'completed' &&
                    <div className="admin-log-line">✓ PLY 모델 저장 완료</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 네비게이션 버튼 */}
      {!started && (
        <div className="admin-wizard-nav">
          <button className="admin-btn admin-btn-ghost" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>
            <Icon name="arrow" size={16} /> 이전
          </button>
          {step < STEPS.length ? (
            <button className="admin-btn admin-btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && (!spaceName.trim() || !selectedBuildingId || !selectedFloorId)) ||
                (step === 2 && !file)
              }>
              다음 →
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── 모델 관리 ────────────────────────────────────────────────────────
function ModelManager({ onNavigate }) {
  const [filter, setFilter] = useState('all');
  const filters = [
    { key: 'all', label: '전체' },
    { key: 'done', label: '완료' },
    { key: 'processing', label: '처리중' },
    { key: 'error', label: '오류' },
  ];
  const filtered = filter === 'all' ? DUMMY_MODELS : DUMMY_MODELS.filter((m) => m.status === filter);

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">모델 관리</h2>
          <p className="admin-page-sub">등록된 3D 모델을 관리하세요</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => onNavigate('upload')}>
          <Icon name="plus" size={16} /> 새 업로드
        </button>
      </div>

      <div className="admin-filter-bar">
        {filters.map((f) => (
          <button key={f.key} className={`admin-filter-btn ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}>
            {f.label}
            <span className="admin-filter-count">
              {f.key === 'all' ? DUMMY_MODELS.length : DUMMY_MODELS.filter((m) => m.status === f.key).length}
            </span>
          </button>
        ))}
      </div>

      <ModelTable models={filtered} onNavigate={onNavigate} />
    </div>
  );
}

// ─── 도면 연동 (미사용 — 주석 처리) ─────────────────────────────────
/*
function FloorPlanLinker() {
  const [selectedModel, setSelectedModel] = useState('');
  const [floorPlanUploaded, setFloorPlanUploaded] = useState(false);
  const [gcpPoints, setGcpPoints] = useState([
    { id: 1, label: 'GCP-01', x3d: '12.4', y3d: '8.2', xMap: '142', yMap: '320' },
    { id: 2, label: 'GCP-02', x3d: '45.1', y3d: '8.2', xMap: '487', yMap: '318' },
    { id: 3, label: 'GCP-03', x3d: '12.4', y3d: '32.7', xMap: '145', yMap: '621' },
  ]);

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">도면 연동</h2>
          <p className="admin-page-sub">3D 모델과 2D 도면을 연결하세요</p>
        </div>
      </div>

      {/* Step 1: 모델 선택 *\/}
      <div className="admin-link-section">
        <div className="admin-link-step-badge">1</div>
        <div className="admin-link-step-body">
          <h3 className="admin-link-step-title">3D 모델 선택</h3>
          <select className="admin-select" value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">모델을 선택하세요</option>
            {DUMMY_MODELS.filter((m) => m.status === 'done').map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: 도면 업로드 *\/}
      <div className={`admin-link-section ${!selectedModel ? 'disabled' : ''}`}>
        <div className="admin-link-step-badge">2</div>
        <div className="admin-link-step-body">
          <h3 className="admin-link-step-title">도면 이미지 업로드</h3>
          {!floorPlanUploaded ? (
            <div className="admin-dropzone admin-dropzone-sm"
              onClick={() => selectedModel && setFloorPlanUploaded(true)}>
              <Icon name="map" size={24} />
              <div>도면 파일을 드래그하거나 클릭 (PNG, PDF)</div>
            </div>
          ) : (
            <div className="admin-floor-plan-preview">
              <div className="admin-floor-plan-mock">
                <div className="admin-floor-plan-grid" />
                <div className="admin-floor-plan-rooms">
                  {gcpPoints.map((p) => (
                    <div key={p.id} className="admin-gcp-marker"
                      style={{ left: `${(parseInt(p.xMap) / 6.5)}%`, top: `${(parseInt(p.yMap) / 9.4)}%` }}>
                      <div className="admin-gcp-dot" />
                      <div className="admin-gcp-label">{p.label}</div>
                    </div>
                  ))}
                </div>
                <div className="admin-floor-plan-label">도면 미리보기 (GCP 위치 표시)</div>
              </div>
              <button className="admin-text-btn" onClick={() => setFloorPlanUploaded(false)}>다시 업로드</button>
            </div>
          )}
        </div>
      </div>

      {/* Step 3: GCP 매핑 *\/}
      <div className={`admin-link-section ${!floorPlanUploaded ? 'disabled' : ''}`}>
        <div className="admin-link-step-badge">3</div>
        <div className="admin-link-step-body">
          <h3 className="admin-link-step-title">GCP 좌표 매핑</h3>
          <p className="admin-link-step-desc">3D 공간의 기준점과 도면의 픽셀 좌표를 연결합니다.</p>
          <div className="admin-gcp-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>기준점</th>
                  <th>3D X</th>
                  <th>3D Y</th>
                  <th>도면 X (px)</th>
                  <th>도면 Y (px)</th>
                </tr>
              </thead>
              <tbody>
                {gcpPoints.map((p) => (
                  <tr key={p.id}>
                    <td><span className="admin-gcp-badge">{p.label}</span></td>
                    <td><input className="admin-input admin-input-sm" value={p.x3d}
                      onChange={(e) => setGcpPoints(gcpPoints.map((g) => g.id === p.id ? { ...g, x3d: e.target.value } : g))} /></td>
                    <td><input className="admin-input admin-input-sm" value={p.y3d}
                      onChange={(e) => setGcpPoints(gcpPoints.map((g) => g.id === p.id ? { ...g, y3d: e.target.value } : g))} /></td>
                    <td><input className="admin-input admin-input-sm" value={p.xMap}
                      onChange={(e) => setGcpPoints(gcpPoints.map((g) => g.id === p.id ? { ...g, xMap: e.target.value } : g))} /></td>
                    <td><input className="admin-input admin-input-sm" value={p.yMap}
                      onChange={(e) => setGcpPoints(gcpPoints.map((g) => g.id === p.id ? { ...g, yMap: e.target.value } : g))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="admin-text-btn" style={{ marginTop: 8 }}
              onClick={() => setGcpPoints([...gcpPoints, { id: Date.now(), label: `GCP-0${gcpPoints.length + 1}`, x3d: '', y3d: '', xMap: '', yMap: '' }])}>
              <Icon name="plus" size={14} /> 기준점 추가
            </button>
          </div>
          <button className="admin-btn admin-btn-primary" style={{ marginTop: 20 }}>
            연동 저장
          </button>
        </div>
      </div>
    </div>
  );
}
*/

// ─── 건물 관리 ────────────────────────────────────────────────────────
function BuildingManager({ onOpenFloors }) {
  const [buildings, setBuildings] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState({ name: '', address: '', description: '' });

  const load = async () => {
    setLoading(true);
    try {
      setBuildings(await fetchBuildings());
    } catch {
      setBuildings(DUMMY_BUILDINGS);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm({ name: '', address: '', description: '' }); setShowForm(true); };
  const openEdit = (b) => { setEditId(b.id); setForm({ name: b.name, address: b.address || '', description: b.description || '' }); setShowForm(true); };

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('건물 이름을 입력하세요.'); return; }
    const body = { name: form.name.trim(), address: form.address || null, description: form.description || null };
    try {
      if (editId) await updateBuilding(editId, body);
      else await createBuilding(body);
      setShowForm(false); setError(''); load();
    } catch (error) { setError(describeApiError(error, '저장에 실패했습니다.')); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`"${name}" 건물을 삭제하시겠습니까?\n모든 층과 그래프 데이터가 삭제됩니다.`)) return;
    try {
      await deleteBuilding(id);
      load();
    } catch { setError('삭제에 실패했습니다.'); }
  };

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">건물 관리</h2>
          <p className="admin-page-sub">건물을 등록하고 층을 관리하세요</p>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openAdd}>
          <Icon name="plus" size={16} /> 건물 추가
        </button>
      </div>

      {error && (
        <div className="admin-tip" style={{ borderColor: 'var(--admin-danger)', marginBottom: 12 }}>
          <Icon name="alert" size={15} /><span>{error}</span>
        </div>
      )}

      {showForm && (
        <div className="admin-form-card">
          <h3 className="admin-form-card-title">{editId ? '건물 수정' : '새 건물 등록'}</h3>
          <div className="admin-form-grid">
            <div className="admin-form-group admin-form-full">
              <label className="admin-label">건물 이름 <span className="admin-required">*</span></label>
              <input className="admin-input" value={form.name} placeholder="예: 공학관"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">주소</label>
              <input className="admin-input" value={form.address} placeholder="선택 사항"
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">설명</label>
              <input className="admin-input" value={form.description} placeholder="선택 사항"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-ghost" onClick={() => setShowForm(false)}>취소</button>
            <button className="admin-btn admin-btn-primary" onClick={handleSubmit}>저장</button>
          </div>
        </div>
      )}

      {loading ? <div className="admin-empty">불러오는 중…</div>
        : buildings.length === 0 ? <div className="admin-empty">등록된 건물이 없습니다.</div>
        : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>건물 이름</th><th>주소</th><th>설명</th><th>작업</th></tr></thead>
              <tbody>
                {buildings.map(b => (
                  <tr key={b.id}>
                    <td><div className="admin-table-name"><Icon name="building" size={15} />{b.name}</div></td>
                    <td className="admin-table-muted">{b.address || '—'}</td>
                    <td className="admin-table-muted">{b.description || '—'}</td>
                    <td>
                      <div className="admin-table-actions">
                        <button className="admin-icon-btn" title="층 관리" onClick={() => onOpenFloors(b)}>
                          <Icon name="layers" size={15} />
                        </button>
                        <button className="admin-icon-btn" title="수정" onClick={() => openEdit(b)}>
                          <Icon name="pencil" size={15} />
                        </button>
                        <button className="admin-icon-btn admin-icon-btn-danger" title="삭제"
                          onClick={() => handleDelete(b.id, b.name)}>
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ─── 층 관리 ──────────────────────────────────────────────────────────
function SpacePlyManager({ floors, selectedBuilding, onOpenEditor, onRefreshFloors }) {
  const [spacesByFloor, setSpacesByFloor] = useState({});
  const [spaceNameByFloor, setSpaceNameByFloor] = useState({});
  const [uploadingKey, setUploadingKey] = useState('');
  const [error, setError] = useState('');
  const loadSpacesForFloor = async (floorId) => {
    try { const data = await fetchSpaces(floorId); setSpacesByFloor(prev => ({ ...prev, [floorId]: data })); }
    catch { setSpacesByFloor(prev => ({ ...prev, [floorId]: [] })); }
  };
  useEffect(() => { floors.forEach(f => loadSpacesForFloor(f.id)); }, [floors]);
  const handleCreateSpace = async (floorId) => {
    const name = (spaceNameByFloor[floorId] || '').trim();
    if (!name) { setError('Space name is required.'); return; }
    try { await createSpace({ floor_id: floorId, name, space_type: 'room' }); setSpaceNameByFloor(prev => ({ ...prev, [floorId]: '' })); setError(''); loadSpacesForFloor(floorId); }
    catch { setError('Failed to create space.'); }
  };
  const handleDeleteSpace = async (floorId, spaceId) => {
    if (!window.confirm('Delete this space?')) return;
    try { await deleteSpace(spaceId); loadSpacesForFloor(floorId); }
    catch { setError('Failed to delete space.'); }
  };
  const handlePlyUpload = async (targetType, id, file, floorIdForRefresh = null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ply')) { setError('Only .ply files can be uploaded.'); return; }
    const key = `${targetType}:${id}`;
    setUploadingKey(key);
    try { if (targetType === 'space') await uploadSpacePly(id, file); else await uploadFloorPly(id, file); setError(''); if (targetType === 'space' && floorIdForRefresh) loadSpacesForFloor(floorIdForRefresh); if (targetType === 'floor') onRefreshFloors?.(); }
    catch { setError('PLY upload failed.'); }
    finally { setUploadingKey(''); }
  };
  if (!floors.length) return null;
  return (
    <div className="admin-space-manager">
      <h3 className="admin-form-card-title">PLY / Space management</h3>
      {error && <div className="admin-tip" style={{ borderColor: 'var(--admin-danger)', marginBottom: 12 }}><Icon name="alert" size={15} /><span>{error}</span></div>}
      {floors.map(f => {
        const floorLabel = `${selectedBuilding?.name || ''} ${f.floor_name || f.floor_number + 'F'}`;
        const floorSpaces = spacesByFloor[f.id] || [];
        return (
          <div className="admin-space-panel" key={`space-panel-${f.id}`}>
            <div className="admin-space-header"><div><strong>{floorLabel}</strong><div className="admin-table-muted">{f.splat_path ? 'Floor PLY linked' : 'Floor PLY not uploaded'}</div></div><div className="admin-table-actions"><button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => onOpenEditor(f.id, floorLabel, 'floor')}><Icon name="network" size={13} /> Floor graph</button><label className="admin-btn admin-btn-sm admin-btn-outline">{uploadingKey === `floor:${f.id}` ? 'Uploading...' : 'Upload floor PLY'}<input type="file" accept=".ply" style={{ display: 'none' }} onChange={e => handlePlyUpload('floor', f.id, e.target.files?.[0])} /></label></div></div>
            <div className="admin-space-form"><input className="admin-input" value={spaceNameByFloor[f.id] || ''} placeholder="Room / space name" onChange={e => setSpaceNameByFloor(prev => ({ ...prev, [f.id]: e.target.value }))} /><button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => handleCreateSpace(f.id)}>Add space</button></div>
            {floorSpaces.length === 0 ? <div className="admin-table-muted">No spaces registered.</div> : <div className="admin-space-list">{floorSpaces.map(space => <div className="admin-space-item" key={space.id}><div><strong>{space.name}</strong><span className="admin-table-muted"> - {space.splat_path ? 'PLY linked' : 'No PLY'}</span></div><div className="admin-table-actions"><button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => onOpenEditor(space.id, `${floorLabel} / ${space.name}`, 'space')}><Icon name="network" size={13} /> Space graph</button><label className="admin-btn admin-btn-sm admin-btn-outline">{uploadingKey === `space:${space.id}` ? 'Uploading...' : 'Upload PLY'}<input type="file" accept=".ply" style={{ display: 'none' }} onChange={e => handlePlyUpload('space', space.id, e.target.files?.[0], f.id)} /></label><button className="admin-icon-btn admin-icon-btn-danger" title="Delete space" onClick={() => handleDeleteSpace(f.id, space.id)}><Icon name="trash" size={15} /></button></div></div>)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function FloorManager({ onOpenEditor, initialBuildingId, floorOverrides = {} }) {
  const [buildings,    setBuildings]    = useState([]);
  const [selectedBId,  setSelectedBId]  = useState(initialBuildingId || null);
  const [floors,       setFloors]       = useState([]);
  const [loadingF,     setLoadingF]     = useState(false);
  const [error,        setError]        = useState('');
  const [showForm,     setShowForm]     = useState(false);
  const [editId,       setEditId]       = useState(null);
  const [form,         setForm]         = useState({ floor_number: '', floor_name: '' });

  useEffect(() => {
    fetchBuildings()
      .then(setBuildings)
      .catch(() => setBuildings(DUMMY_BUILDINGS));
  }, []);

  const loadFloors = async (bid) => {
    if (!bid) { setFloors([]); return; }
    setLoadingF(true);
    try {
      const loadedFloors = await fetchFloors(bid);
      setFloors(loadedFloors.map((floor) => ({ ...floor, ...(floorOverrides[floor.id] || {}) })));
    } catch {
      setFloors(DUMMY_FLOORS
        .filter(f => f.building_id === bid)
        .map((floor) => ({ ...floor, ...(floorOverrides[floor.id] || {}) })));
    }
    finally { setLoadingF(false); }
  };

  useEffect(() => { loadFloors(selectedBId); }, [selectedBId, floorOverrides]);

  const openAdd = () => { setEditId(null); setForm({ floor_number: '', floor_name: '' }); setShowForm(true); };
  const openEdit = (f) => { setEditId(f.id); setForm({ floor_number: f.floor_number, floor_name: f.floor_name || '' }); setShowForm(true); };

  const handleSubmit = async () => {
    if (!editId && !form.floor_number) { setError('층 번호를 입력하세요.'); return; }
    try {
      if (editId) {
        await updateFloor(editId, { floor_name: form.floor_name || null });
      } else {
        await createFloor({
          building_id: selectedBId,
          floor_number: Number(form.floor_number),
          floor_name: form.floor_name || null,
        });
      }
      setShowForm(false); setError(''); loadFloors(selectedBId);
    } catch { setError('저장 실패'); }
  };

  const handleDelete = async (id, label) => {
    if (!window.confirm(`"${label}" 층을 삭제하시겠습니까?`)) return;
    try {
      await deleteFloor(id);
      loadFloors(selectedBId);
    } catch {
      setError('삭제에 실패했습니다.');
    }
  };

  const selectedBuilding = buildings.find(b => b.id === selectedBId);

  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">층 관리</h2>
          <p className="admin-page-sub">건물을 선택한 후 층을 관리하세요</p>
        </div>
        {selectedBId && (
          <button className="admin-btn admin-btn-primary" onClick={openAdd}>
            <Icon name="plus" size={16} /> 층 추가
          </button>
        )}
      </div>

      {error && (
        <div className="admin-tip" style={{ borderColor: 'var(--admin-danger)', marginBottom: 12 }}>
          <Icon name="alert" size={15} /><span>{error}</span>
        </div>
      )}

      <div className="admin-form-group" style={{ maxWidth: 320, marginBottom: 20 }}>
        <label className="admin-label">건물 선택</label>
        <select className="admin-select" value={selectedBId || ''}
          onChange={e => { setSelectedBId(Number(e.target.value) || null); setShowForm(false); }}>
          <option value="">건물을 선택하세요</option>
          {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="admin-form-card">
          <h3 className="admin-form-card-title">{editId ? '층 수정' : '새 층 등록'}</h3>
          <div className="admin-form-grid">
            <div className="admin-form-group">
              <label className="admin-label">층 번호 <span className="admin-required">*</span></label>
              <input className="admin-input" type="number" value={form.floor_number} placeholder="예: 1"
                onChange={e => setForm(f => ({ ...f, floor_number: e.target.value }))} disabled={!!editId} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">층 이름</label>
              <input className="admin-input" value={form.floor_name} placeholder="예: 1층"
                onChange={e => setForm(f => ({ ...f, floor_name: e.target.value }))} />
            </div>
          </div>
          <div className="admin-form-actions">
            <button className="admin-btn admin-btn-ghost" onClick={() => setShowForm(false)}>취소</button>
            <button className="admin-btn admin-btn-primary" onClick={handleSubmit}>저장</button>
          </div>
        </div>
      )}

      {loadingF ? <div className="admin-empty">불러오는 중…</div>
        : selectedBId && floors.length === 0 ? <div className="admin-empty">등록된 층이 없습니다.</div>
        : selectedBId && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead><tr><th>층 번호</th><th>층 이름</th><th>상태</th><th>3DGS</th><th>작업</th></tr></thead>
              <tbody>
                {floors.map(f => {
                  const floorLabel = `${selectedBuilding?.name || ''} ${f.floor_name || f.floor_number + '층'}`;
                  return (
                    <tr key={f.id}>
                      <td><span className="admin-floor-badge">{f.floor_number}F</span></td>
                      <td>{f.floor_name || '—'}</td>
                      <td>
                        <span className={`admin-status-badge ${STATUS_CLASS[f.status] || ''}`}>
                          {STATUS_LABEL[f.status] || f.status || '미정'}
                        </span>
                      </td>
                      <td className="admin-table-muted">{f.splat_path ? '완료' : '없음'}</td>
                      <td>
                        <div className="admin-table-actions">
                          <button className="admin-btn admin-btn-sm admin-btn-outline"
                            title="그래프 편집"
                            onClick={() => onOpenEditor(f.id, floorLabel)}>
                            <Icon name="network" size={13} /> 그래프 편집
                          </button>
                          <button className="admin-icon-btn" title="수정" onClick={() => openEdit(f)}>
                            <Icon name="pencil" size={15} />
                          </button>
                          <button className="admin-icon-btn admin-icon-btn-danger" title="삭제"
                            onClick={() => handleDelete(f.id, f.floor_name || `${f.floor_number}층`)}>
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      {selectedBId && floors.length > 0 && (
        <SpacePlyManager
          floors={floors}
          selectedBuilding={selectedBuilding}
          onOpenEditor={onOpenEditor}
          onRefreshFloors={() => loadFloors(selectedBId)}
        />
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { key: 'dashboard', label: '대시보드',   icon: 'dashboard' },
  { key: 'buildings', label: '건물 관리',  icon: 'building'  },
  { key: 'floors',    label: '층 관리',    icon: 'layers'    },
  { key: 'upload',    label: '영상 업로드', icon: 'upload'    },
  { key: 'models',    label: '모델 관리',  icon: 'cube'      },
  // { key: 'floorplan', label: '도면 연동',  icon: 'map' },
  { key: 'settings',  label: '설정',       icon: 'settings'  },
];

function Sidebar({ current, onNavigate, onExit }) {
  const handleItem = (key) => { onNavigate(key); };

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-logo">
        <div className="admin-logo-icon">DT</div>
        <div>
          <div className="admin-logo-title">디지털 트윈</div>
          <div className="admin-logo-badge">관리자</div>
        </div>
      </div>

      <nav className="admin-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`admin-nav-item ${current === item.key ? 'active' : ''}`}
            onClick={() => handleItem(item.key)}
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <button className="admin-nav-item admin-nav-exit" onClick={onExit}>
          <Icon name="arrow" size={17} />
          <span>앱으로 돌아가기</span>
        </button>
      </div>
    </aside>
  );
}

// ─── 설정 페이지 ──────────────────────────────────────────────────────
function SettingsPage() {
  return (
    <div className="admin-content-inner">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">설정</h2>
          <p className="admin-page-sub">시스템 및 처리 기본값을 설정하세요</p>
        </div>
      </div>
      <div className="admin-settings-grid">
        <div className="admin-settings-card">
          <h3 className="admin-settings-section">서버 설정</h3>
          <div className="admin-form-group">
            <label className="admin-label">처리 서버 URL</label>
            <input className="admin-input" defaultValue="http://localhost:8000" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">API 키</label>
            <input className="admin-input" type="password" defaultValue="••••••••••••••••" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">동시 처리 최대 작업 수</label>
            <select className="admin-select">
              <option>1</option><option>2</option><option>4</option>
            </select>
          </div>
        </div>
        <div className="admin-settings-card">
          <h3 className="admin-settings-section">기본 처리 설정</h3>
          <div className="admin-form-group">
            <label className="admin-label">기본 품질</label>
            <select className="admin-select">
              <option>표준</option><option>빠른 처리</option><option>고품질</option>
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-label">기본 Iterations</label>
            <input className="admin-input" type="number" defaultValue="30000" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">결과물 저장 경로</label>
            <input className="admin-input" defaultValue="/data/models" />
          </div>
        </div>
      </div>
      <button className="admin-btn admin-btn-primary">저장</button>
    </div>
  );
}

// ─── 메인 AdminPage ───────────────────────────────────────────────────
export default function AdminPage({ onExit, onOpenEditor }) {
  const [page,              setPage]              = useState('dashboard');
  const [initialBuildingId, setInitialBuildingId] = useState(null);
  const [floorCompletionOverrides, setFloorCompletionOverrides] = useState({});

  const handleOpenFloors = (building) => {
    setInitialBuildingId(building.id);
    setPage('floors');
  };

  const handleUploadCompleted = ({ buildingId, floorId, floor }) => {
    setFloorCompletionOverrides((overrides) => ({
      ...overrides,
      [floorId]: {
        ...floor,
        status: 'completed',
        splat_path: floor?.splat_path || DEFAULT_COMPLETED_SPLAT_PATH,
      },
    }));
    setInitialBuildingId(buildingId);
  };

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={setPage} onOpenEditor={onOpenEditor} />;
      case 'buildings': return <BuildingManager onOpenFloors={handleOpenFloors} />;
      case 'floors':    return <FloorManager onOpenEditor={onOpenEditor} initialBuildingId={initialBuildingId} floorOverrides={floorCompletionOverrides} />;
      case 'upload':    return <UploadWizard onCompleted={handleUploadCompleted} />;
      case 'models':    return <ModelManager onNavigate={setPage} />;
      // case 'floorplan': return <FloorPlanLinker />;
      case 'settings':  return <SettingsPage />;
      default:          return <Dashboard onNavigate={setPage} />;
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar current={page} onNavigate={setPage} onExit={onExit} />
      <main className="admin-main">
        <div className="admin-content">{renderPage()}</div>
      </main>
    </div>
  );
}
