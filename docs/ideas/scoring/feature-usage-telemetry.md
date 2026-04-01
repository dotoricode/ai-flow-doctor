# Feature Usage Telemetry (개발자용 기능 사용 측정)

> Status: 💡 draft
> Created: 2026-04-01

## 목적

afd 기능 중 실제로 자주 사용되는 것과 사용되지 않는 것을 데이터로 파악하여,
기능 개선·폐기·우선순위 판단의 근거로 활용한다.

**대상:** 개발자(우리)용. 외부 전송 없음. 로컬 SQLite 전용.

## 현황 분석

### 이미 측정되는 것
| 지표 | 저장소 | 비고 |
|------|--------|------|
| 파일 이벤트 (type, path, timestamp) | `events` 테이블 | ✅ 영속 |
| Hologram 요청수/절약량 | `hologram_lifetime/daily` | ✅ 영속 |

### 측정되지만 휘발되는 것 (버그)
| 지표 | 저장소 | 문제 |
|------|--------|------|
| Auto-heal 횟수 | `DaemonState` 인메모리 | 재시작 시 소실 |
| Suppression skip 횟수 | `DaemonState` 인메모리 | 재시작 시 소실 |
| Dormant transition 기록 | `DaemonState` 인메모리 | 재시작 시 소실 |

### 전혀 측정되지 않는 것
| 지표 | 가치 |
|------|------|
| CLI 명령어별 호출 빈도 | 어떤 명령어가 죽은 기능인지 판별 |
| MCP 도구별 호출 빈도 | AI 에이전트가 실제로 어떤 도구를 쓰는지 |
| S.E.A.M 단계별 소요시간 | 병목 구간 식별 |
| Antibody 적중 vs 미스 비율 | 면역 규칙의 실효성 평가 |
| Validator 발동 횟수 + 결과 | Dynamic Immune Synthesis 효용 측정 |
| 에코시스템별 사용 비율 | Claude Code vs Cursor vs Windsurf 중 어디에 집중할지 |

## 설계 제안

### 1. 단일 `telemetry` 테이블

```sql
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,   -- 'cli' | 'mcp' | 'seam' | 'immune' | 'validator'
  action TEXT NOT NULL,     -- 'score' | 'afd_hologram' | 'sense' | 'heal_hit' | ...
  detail TEXT,              -- JSON metadata (nullable, 선택적 컨텍스트)
  duration_ms REAL,         -- 소요시간 (nullable, 성능 측정용)
  timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX idx_telemetry_cat_ts ON telemetry(category, timestamp);
CREATE INDEX idx_telemetry_action ON telemetry(action);
```

**설계 근거:**
- 테이블 하나로 통합 → 스키마 변경 없이 새 카테고리 추가 가능
- `detail`은 nullable JSON → 필요한 경우만 추가 컨텍스트 기록
- `duration_ms` → S.E.A.M 성능 측정에 활용
- 인덱스 2개로 "카테고리별 시계열 조회"와 "액션별 집계" 모두 커버

### 2. 수집 지점 (삽입 위치)

| Category | Action | 삽입 위치 | 구현 난이도 |
|----------|--------|----------|------------|
| `cli` | 명령어명 | `cli.ts` — Commander `preAction` 훅 1줄 | 극히 낮음 |
| `mcp` | 도구명 | `mcp-handler.ts` — tool dispatch 직후 | 낮음 |
| `seam` | `sense/extract/analyze/mutate` | `server.ts` — 각 단계 진입/완료 | 중간 |
| `immune` | `heal_hit/heal_miss/suppression` | `server.ts` — 면역 판정 분기점 | 낮음 |
| `validator` | validator 파일명 | `server.ts` — isCorrupted() 내부 | 낮음 |

### 3. 집계 및 조회

#### `afd stats` 명령어 (신규)
```
$ afd stats --days 7

📊 Feature Usage (last 7 days)
───────────────────────────────────────
CLI Commands        MCP Tools
  score    ████ 42    afd_read      ████ 38
  start    ███  31    afd_hologram  ███  27
  fix      ██   18    afd_diagnose  ██   15
  doctor   █    8     afd_score     █    9
  sync     ░    2
  vaccine  ░    0  ← 사용되지 않는 기능

S.E.A.M Performance (avg)
  Sense → Extract → Analyze → Mutate
  12ms    34ms      89ms       22ms   = 157ms total

Immune Activity
  Antibody hits: 23  |  misses: 4  |  accuracy: 85%
  Validator blocks: 7
  Suppressions: 3
```

#### 리포트 자동 생성 (선택적 확장)
- `afd stats --export` → JSON 덤프
- 주간 자동 집계 → `docs/release/` 또는 별도 디렉토리에 스냅샷

### 4. 데이터 수명 관리

| 정책 | 값 | 근거 |
|------|-----|------|
| Raw 보존 기간 | 30일 | 충분한 트렌드 파악 + 디스크 절약 |
| 일별 집계 보존 | 무기한 | 집계 row는 극소량 (365행/년) |
| Purge 시점 | 데몬 시작 시 | Crash-Only 철학 — 시작할 때 정리 |

```sql
-- 데몬 시작 시 실행
DELETE FROM telemetry WHERE timestamp < unixepoch() * 1000 - 30 * 86400000;
```

### 5. 성능 영향 분석

- SQLite WAL INSERT: ~0.1ms (SSD 기준)
- S.E.A.M 270ms 예산 대비 0.04% — **무시 가능**
- 인메모리 버퍼 불필요 → Crash-Only 원칙과 정합

## 인메모리 카운터 소실 문제 (선행 수정)

telemetry 테이블 도입 시, 기존 `DaemonState`의 인메모리 카운터를 이 테이블로 대체:
- `autoHealCount` → `INSERT INTO telemetry (category, action) VALUES ('immune', 'heal_hit')`
- `suppressionSkippedCount` → `INSERT INTO telemetry ... ('immune', 'suppression')`
- `dormantTransitions` → `INSERT INTO telemetry ... ('immune', 'dormant') + detail JSON`

기존 `/score` 엔드포인트는 `SELECT COUNT(*) FROM telemetry WHERE ...`로 조회 전환.
→ 재시작 후에도 데이터 보존 + Guardian 점수의 정확도 향상.

## 우선순위 제안

| Phase | 범위 | 효과 |
|-------|------|------|
| **P0** | 인메모리 카운터 → SQLite 영속화 | 기존 데이터 소실 버그 수정 |
| **P1** | CLI + MCP 호출 빈도 수집 | 죽은 기능 식별 (가장 빠른 인사이트) |
| **P2** | S.E.A.M 단계별 duration 측정 | 성능 병목 파악 |
| **P3** | `afd stats` 명령어 + 시각화 | 데이터 접근성 확보 |
| **P4** | Immune accuracy 측정 | 면역 품질 정량화 → S 랭크 조건 연계 가능 |

## 열린 질문

- `afd stats`를 Magic 5 명령어 밖에 두는 게 맞는가? (개발자 전용이니 OK?)
- P4의 immune accuracy를 S 랭크 조건에 직접 연결할 것인가?
- 에코시스템별 사용 비율도 category에 포함할 것인가?
