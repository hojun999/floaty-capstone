# Building API

건물과 층 정보를 관리하는 독립 실행형 FastAPI 백엔드입니다.

프론트엔드, 3DGS 파이프라인, 파일 업로드, 좌표 변환, 경로 탐색 코드는 포함하지 않습니다.

## 포함된 기능

- 건물 등록, 조회, 수정, 삭제
- 층 등록, 조회, 수정, 삭제
- 기존 층 응답 필드(`floor_plan_path`, `splat_path`, `status`) 유지
- PostgreSQL 또는 SQLite 연결
- FastAPI Swagger 문서 제공

## 프로젝트 구조

```text
building-api/
├── app/
│   ├── main.py
│   ├── database.py
│   ├── settings.py
│   ├── api/
│   │   ├── __init__.py
│   │   └── endpoints/
│   │       ├── __init__.py
│   │       └── buildings.py
│   ├── models/
│   │   ├── __init__.py
│   │   └── building.py
│   └── schemas/
│       ├── __init__.py
│       └── building.py
├── .env.example
├── .gitignore
├── README.md
├── requirements.txt
└── start.py
```

## Cloudtype 배포 설정

Cloudtype에서는 서비스의 루트 디렉터리를 `building-api`로 지정하는 것을 권장합니다.

| 항목 | 값 |
| --- | --- |
| Runtime | Python |
| Root Directory | `building-api` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python start.py` |
| Health Check Path | `/` |

저장소 루트에서 명령을 실행해야 하는 설정이라면 아래처럼 `building-api`로 이동한 뒤 실행하세요.

```bash
cd building-api && pip install -r requirements.txt
cd building-api && python start.py
```

## 필요한 런타임 버전

| 런타임 | 필요 여부 | 권장 버전 |
| --- | --- | --- |
| Python | 필요 | `3.10` 이상 |
| Node.js | 불필요 | 사용하지 않음 |
| Java | 불필요 | 사용하지 않음 |

## PostgreSQL 연결 준비

Cloudtype에서 데이터를 유지하려면 SQLite 파일 대신 PostgreSQL 같은 외부 DB를 사용하세요. 현재 프로젝트는 `psycopg2-binary` 드라이버를 포함하며, `DATABASE_URL` 환경변수로 PostgreSQL에 연결할 수 있습니다.

Cloudtype PostgreSQL을 같은 배포환경에 둘 경우, 공식 문서 기준으로 애플리케이션은 PostgreSQL 서비스명을 호스트명으로 사용할 수 있고 내부 통신 포트는 `5432`입니다.

Cloudtype 작업 순서:

1. Cloudtype에서 PostgreSQL 서비스를 생성합니다.
2. PostgreSQL 서비스 이름을 정합니다. 예: `postgresql-prod`
3. DB 사용자, 비밀번호, DB 이름을 확인합니다.
4. 백엔드 서비스의 Environment Variables 또는 Secret에 `DATABASE_URL`을 등록합니다.
5. 백엔드 서비스를 재배포합니다.
6. 배포 후 `/` 또는 `/docs`에 접속해 서버가 정상 기동되는지 확인합니다.

`DATABASE_URL` 예시:

```env
DATABASE_URL=postgresql+psycopg2://DB_USER:DB_PASSWORD@postgresql-prod:5432/DB_NAME
```

실제 사용자명, 비밀번호, DB 이름은 Cloudtype 환경변수 또는 시크릿에만 저장하고 Git에 커밋하지 마세요.

## 테이블 생성

현재는 별도 마이그레이션 도구 없이 앱 시작 시 SQLAlchemy가 테이블을 생성합니다.

```python
Base.metadata.create_all(bind=engine)
```

최초 배포 시 PostgreSQL DB에 `buildings`, `floors` 테이블이 없으면 서버 시작 과정에서 자동 생성됩니다. 운영 환경에서 스키마 변경 이력을 관리하려면 이후 Alembic 도입을 권장합니다.

## 환경변수

하드코딩되어 있던 실행 설정은 환경변수로 분리했습니다. `.env`는 `.gitignore`에 포함되어 있으므로 실제 배포값이나 비밀값을 커밋하지 마세요.

| 변수 | 필수 | 기본값 | 설명 | 예시 |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | 배포 시 권장 | `sqlite:///./building_api.db` | SQLAlchemy 데이터베이스 URL입니다. Cloudtype 배포에서는 PostgreSQL URL을 등록하세요. | `postgresql+psycopg2://DB_USER:DB_PASSWORD@postgresql-prod:5432/DB_NAME` |
| `CORS_ORIGIN` | 아니오 | `http://localhost:3000,http://127.0.0.1:3000` | 허용할 프론트엔드 Origin입니다. 배포 환경에서는 실제 프론트엔드 도메인을 지정하세요. 여러 개가 필요하면 콤마로 구분할 수 있습니다. | `https://frontend.example.com` |
| `APP_HOST` | 아니오 | `0.0.0.0` | Uvicorn 서버가 바인딩할 호스트입니다. Cloudtype 배포에서는 `0.0.0.0`을 사용합니다. | `0.0.0.0` |
| `PORT` | 아니오 | `8000` | 서버가 listen할 포트입니다. Cloudtype에서는 플랫폼이 제공하는 `PORT` 값을 우선 사용합니다. | `8000` |

## .env.example

`.env.example`에는 변수 이름과 로컬 실행용 예시값만 둡니다.

```env
DATABASE_URL=sqlite:///./building_api.db
# Cloudtype PostgreSQL example:
# DATABASE_URL=postgresql+psycopg2://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
CORS_ORIGIN=http://localhost:3000
APP_HOST=0.0.0.0
PORT=8000
```

## CORS 설정

프론트엔드와 백엔드가 다른 도메인에서 동작하므로 CORS 허용 Origin을 환경변수로 관리합니다.

로컬 개발 기본값:

```env
CORS_ORIGIN=http://localhost:3000
```

배포 환경에서는 Cloudtype 백엔드 서비스의 환경변수에 실제 프론트엔드 도메인을 등록하세요.

```env
CORS_ORIGIN=https://your-frontend-domain.example.com
```

현재 백엔드는 로그인 세션, 쿠키, Authorization 기반 인증을 사용하지 않습니다. 따라서 CORS `allow_credentials`는 `False`로 설정되어 있습니다. 나중에 쿠키 기반 인증을 추가한다면 `allow_credentials=True`로 변경하고, `CORS_ORIGIN=*` 같은 전체 허용 설정은 사용하지 않아야 합니다.

## PORT 설정

[start.py](./start.py)는 환경변수에서 `PORT`를 읽습니다. 배포 환경에서는 Cloudtype이 제공하는 `PORT`를 우선 사용하고, 로컬에서 `PORT`가 없으면 `8000`으로 실행됩니다.

```bash
python start.py
```

로컬에서 다른 포트를 쓰고 싶으면 `PORT`를 지정한 뒤 실행하세요.

Windows PowerShell:

```powershell
$env:PORT = "8080"
python start.py
```

macOS/Linux:

```bash
PORT=8080 python start.py
```

## 로컬 실행

Windows PowerShell 기준:

```powershell
cd building-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python start.py
```

macOS/Linux 기준:

```bash
cd building-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python start.py
```

서버 실행 후 아래 주소에서 확인할 수 있습니다.

- API 상태 확인: <http://localhost:8000/>
- Swagger 문서: <http://localhost:8000/docs>
- OpenAPI JSON: <http://localhost:8000/openapi.json>

## Cloudtype 배포 명령어

Cloudtype 서비스 설정에서 `Root Directory`를 `building-api`로 지정했다면 아래 값을 사용합니다.

```text
Build Command: pip install -r requirements.txt
Start Command: python start.py
```

저장소 루트를 기준으로 실행해야 하는 설정이라면 아래처럼 지정합니다.

```text
Build Command: cd building-api && pip install -r requirements.txt
Start Command: cd building-api && python start.py
```

Cloudtype 배포 전 환경변수에는 최소한 배포용 `DATABASE_URL`과 `CORS_ORIGIN`을 등록하세요.

```env
DATABASE_URL=postgresql+psycopg2://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
CORS_ORIGIN=https://your-frontend-domain.example.com
```

`PORT`는 Cloudtype이 제공합니다. 직접 고정하지 말고 `start.py`가 읽도록 두세요.

## 테스트 방법

현재 별도의 자동화 테스트 코드는 없습니다. 배포 또는 로컬 실행 전에는 아래 순서로 스모크 테스트를 진행하세요.

1. Python 문법 확인

```bash
python -m compileall app start.py
```

2. 서버 실행

```bash
python start.py
```

3. 상태 확인

```bash
curl http://localhost:8000/
```

예상 응답:

```json
{"status":"ok"}
```

4. 건물 생성 확인

```bash
curl -X POST http://localhost:8000/api/buildings \
  -H "Content-Type: application/json" \
  -d '{"name":"Engineering Building","address":"Seoul","description":"Main building"}'
```

5. 건물 목록 조회 확인

```bash
curl http://localhost:8000/api/buildings
```

6. Swagger 문서 확인

브라우저에서 <http://localhost:8000/docs>에 접속합니다.

## GitHub 업로드 체크리스트

- `.env` 파일은 커밋하지 않습니다.
- 실제 DB 비밀번호가 포함된 `DATABASE_URL`은 GitHub에 올리지 않습니다.
- `.env.example`에는 예시값만 둡니다.
- 로컬 DB 파일(`*.db`, `*.sqlite`, `*.sqlite3`)은 커밋하지 않습니다.
- 가상환경 폴더(`.venv/`, `venv/`)는 커밋하지 않습니다.
- `__pycache__/`, `.pytest_cache/`, `.ruff_cache/` 같은 생성 파일은 커밋하지 않습니다.

## API 목록

### Buildings

```text
POST   /api/buildings
GET    /api/buildings
GET    /api/buildings/{building_id}
PATCH  /api/buildings/{building_id}
DELETE /api/buildings/{building_id}
```

### Floors

```text
POST   /api/floors
GET    /api/floors?building_id={building_id}
GET    /api/floors/{floor_id}
PATCH  /api/floors/{floor_id}
DELETE /api/floors/{floor_id}
```

## 예시 요청

건물 생성:

```bash
curl -X POST http://localhost:8000/api/buildings \
  -H "Content-Type: application/json" \
  -d '{"name":"Engineering Building","address":"Seoul","description":"Main building"}'
```

층 생성:

```bash
curl -X POST http://localhost:8000/api/floors \
  -H "Content-Type: application/json" \
  -d '{"building_id":1,"floor_number":1,"floor_name":"1F"}'
```

## 참고 문서

- [Cloudtype PostgreSQL 가이드](https://docs.cloudtype.io/guide/databases/postgres)
- [Cloudtype 환경변수 설정](https://docs.cloudtype.io/guide/references/env)
