# 디지털 트윈 건물 안내 맵 - 프론트엔드

3D Gaussian Splatting(3DGS)를 활용한 디지털 트윈 건물 안내 맵 프론트엔드 프로토타입

## 기술 스택

- **React 19** + **Vite** — 컴포넌트 기반 UI 및 빌드
- **Three.js** + **gaussian-splats-3d** — 3DGS WebGL 렌더링 (현재 Canvas 2D 프로토타입)
- **Canvas API** — 도면 오버레이 렌더링
- **Axios** — 백엔드 API 통신

## 프로젝트 구조

```
src/
├── main.jsx                  # 엔트리 포인트
├── App.jsx                   # 메인 앱 컴포넌트
├── components/
│   ├── Viewer3D.jsx          # 3DGS 뷰어 (Three.js)
│   ├── FloorPlanViewer.jsx   # 도면 뷰어 (Canvas API)
│   ├── SearchBar.jsx         # POI 검색 자동완성
│   ├── InfoCards.jsx         # 위치/목적지/시간 카드
│   ├── POITags.jsx           # POI 빠른 선택 태그
│   └── RoutePanel.jsx        # 경로 안내 패널
├── data/
│   └── poiData.js            # POI 데이터 & 타입 색상
├── styles/
│   └── global.css            # 전역 스타일 & 디자인 토큰
├── utils/
│   ├── api.js                # 백엔드 API 통신 (Axios)
│   ├── geometry.js           # 좌표 변환 유틸리티
│   └── route.js              # 경로 생성 (클라이언트 폴백)
└── hooks/                    # 커스텀 훅 (확장용)
```

## 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행 (포트 3000)
npm run dev

# 프로덕션 빌드
npm run build
```

## 백엔드 API 연동

`vite.config.js`에서 `/api` 경로를 백엔드 `localhost:8000`으로 프록시합니다.

### API 엔드포인트 (FastAPI)

| Method | Path             | 설명                     |
|--------|-----------------|--------------------------|
| GET    | /api/pois       | POI 목록 (floor 파라미터) |
| POST   | /api/route      | A* 경로 탐색              |
| POST   | /api/transform  | 3DGS↔도면 좌표 변환       |
| GET    | /api/gcps       | GCP 대응점 조회           |

## 실제 3DGS 뷰어 구현 가이드

`Viewer3D.jsx`에서 Canvas 2D 프로토타입을 Three.js로 교체:

```jsx
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// Scene 초기화
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

// 3DGS 뷰어 생성
const viewer = new GaussianSplats3D.Viewer({
  scene,
  camera,
  renderer,
  selfDrivenMode: false,
});

// .ply 또는 .splat 파일 로드
await viewer.addSplatScene('/models/building_floor3.splat', {
  splatAlphaRemovalThreshold: 5,
});
```

## 다음 단계

1. **3DGS 모델 연동**: 학습 파이프라인에서 생성된 .splat 파일 로드
2. **도면 이미지 적용**: Canvas 배경에 실제 CAD 도면 렌더링
3. **백엔드 API 연결**: 목업 데이터를 실제 FastAPI 응답으로 교체
4. **GCP 정합**: Affine 변환으로 3D↔도면 좌표 동기화
5. **반응형 대응**: 모바일 뷰 최적화
