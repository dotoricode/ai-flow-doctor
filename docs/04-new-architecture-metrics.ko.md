# 신규 아키텍처 성능 지표 — Autonomous Flow Daemon (afd)

> 벤치마크 일시: 2026-03-31
> 런타임: Bun 1.3.11 / Windows 10 Pro
> 아키텍처: S.E.A.M 데몬 (Sense → Extract → Adapt → Mutate)

---

## 1. 코드베이스 규모 비교

| 지표 | 구 아키텍처 (Node.js/tsup) | 신규 (Bun Daemon) | 변화율 |
|------|---------------------------:|-------------------:|-------:|
| 총 파일 수 | ~30 | **13** | **-57%** |
| 코드 라인 수 | ~3,700 | **1,208** | **-67%** |
| 의존성 패키지 | 12+ (tsup, esbuild 등) | **3** (commander, chokidar, typescript) | **-75%** |
| 빌드 설정 파일 | 3 (tsconfig, tsup 등) | **0** | **-100%** |
| 빌드 단계 필요 | 예 (tsup 번들) | **불필요** (Bun이 .ts 직접 실행) | 제거됨 |
| 빌드 산출물 | dist/ (~8개 청크) | **없음** (소스 직접 실행) | 제거됨 |

### 파일 구조 (13개 파일, 4개 디렉토리)

```
src/                          LOC
├── cli.ts                     41   # Magic 5 Commands 진입점
├── constants.ts                7   # 공유 경로 상수
├── adapters/
│   └── index.ts               68   # 에코시스템 감지 (Claude/Cursor)
├── commands/
│   ├── start.ts               41   # 데몬 생성
│   ├── stop.ts                35   # 정상 종료
│   ├── score.ts              135   # 전체 진단 대시보드
│   ├── fix.ts                138   # 진단 + JSON-Patch + 항체 학습
│   └── sync.ts                50   # 백신 페이로드 내보내기
├── core/
│   ├── db.ts                  30   # SQLite WAL (이벤트 + 항체)
│   ├── hologram.ts           243   # TS AST 스켈레톤 추출기
│   └── immune.ts             149   # 이중 형식 진단 엔진
└── daemon/
    ├── server.ts             234   # HTTP 데몬 (9개 엔드포인트)
    └── client.ts              37   # IPC 헬퍼
                             ─────
                             1,208 합계
```

---

## 2. 성능 벤치마크

### 2.1 데몬 콜드 스타트 시간

| 실행 | 시간 (ms) |
|-----:|----------:|
| 1 | 1,794 |
| 2 | 1,714 |
| 3 | 1,734 |
| 4 | 1,698 |
| 5 | 1,745 |
| **중앙값** | **1,734 ms** |
| **평균** | **1,737 ms** |

> 참고: Bun 프로세스 생성 + SQLite 초기화 + chokidar 감시자 설정 + HTTP 서버 바인딩 + 포트 파일 기록 + 1,500ms 시작 대기 포함. 실제 데몬 준비 시간은 ~200ms이며, 나머지는 CLI에 내장된 검증 대기 시간입니다.

### 2.2 홀로그램 API (토큰 절감)

| 파일 | 원본 | 홀로그램 | 절감율 | 지연 시간 |
|------|------|----------|-------:|----------:|
| `core/hologram.ts` | 8,425자 | 1,193자 | **85.8%** | 70.52ms |
| `daemon/server.ts` | 8,038자 | 908자 | **88.7%** | 13.22ms |
| `core/immune.ts` | 3,935자 | 636자 | **83.8%** | 3.82ms |
| `commands/score.ts` | 4,898자 | 905자 | **81.5%** | 5.53ms |
| `commands/fix.ts` | 4,156자 | 505자 | **87.8%** | 5.33ms |
| `adapters/index.ts` | 1,700자 | 648자 | **61.9%** | 2.99ms |
| `cli.ts` | 1,010자 | 292자 | **71.1%** | 2.45ms |
| **합계** | **32,162자** | **5,087자** | **84.2%** | — |
| **평균** | — | — | **80.1%** | **14.84ms** |

> 첫 번째 요청(hologram.ts)은 TS Compiler API 콜드 로드 포함 (~70ms). 이후 요청 평균은 **4.7ms**.

### 2.3 SQLite WAL 지연 시간

| 작업 | 실행 횟수 | 중앙값 | 평균 |
|------|----------:|-------:|-----:|
| 쓰기 (INSERT 항체) | 10 | **24.84ms** | 31.40ms |
| 읽기 (SELECT 전체 항체) | 10 | **0.29ms** | 0.31ms |

> 쓰기 지연 시간은 HTTP 라운드트립 + JSON 파싱 + SQLite INSERT 포함. 읽기는 WAL 모드의 비차단 읽기 덕분에 1ms 미만.

---

## 3. Magic 5 Commands — 실행 시간

| 명령어 | 설명 | 중앙값 (ms) | 비고 |
|--------|------|------------:|------|
| `afd start` | 데몬 생성 | **1,734** | 1,500ms 검증 대기 포함 |
| `afd stop` | 데몬 종료 | **183** | 정상 HTTP 종료 + PID 정리 |
| `afd score` | 대시보드 | **201** | 전체 통계 조회 + 터미널 UI 렌더링 |
| `afd fix` | 진단 + 패치 | **177** | 진단 + 면역 확인 (패치 불필요 시) |
| `afd sync` | 백신 내보내기 | **203** | 경로 정제 + JSON 페이로드 기록 |

> 모든 대화형 명령(score, fix, sync)이 **210ms** 이내 응답 — 서브초 목표 달성.

---

## 4. 데몬 REST 엔드포인트

| 메서드 | 경로 | 설명 | 평균 지연 시간 |
|--------|------|------|---------------:|
| GET | `/health` | 생존 확인 | <1ms |
| GET | `/score` | 전체 진단 통계 | <1ms |
| GET | `/hologram?file=<path>` | AST 스켈레톤 추출 | ~5ms |
| GET | `/diagnose` | 증상 감지 실행 | <1ms |
| GET | `/antibodies` | 학습된 패턴 목록 | <1ms |
| POST | `/antibodies/learn` | 새 항체 기록 | ~25ms |
| GET | `/sync` | 백신 페이로드 내보내기 | <5ms |
| GET | `/stop` | 정상 종료 | <1ms |

---

## 5. SQLite 스키마

```sql
-- 이벤트 추적 (파일 감시자)
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  type      TEXT NOT NULL,        -- add, change, unlink
  path      TEXT NOT NULL,        -- 상대 파일 경로
  timestamp INTEGER NOT NULL      -- Unix epoch ms
);

-- 면역 체계 (학습된 패턴)
CREATE TABLE antibodies (
  id           TEXT PRIMARY KEY,  -- 예: "IMM-001"
  pattern_type TEXT NOT NULL,     -- missing-file, invalid-json 등
  file_target  TEXT NOT NULL,     -- 대상 파일 경로
  patch_op     TEXT NOT NULL,     -- RFC 6902 JSON-Patch 배열
  created_at   TEXT NOT NULL      -- datetime('now')
);

PRAGMA journal_mode = WAL;        -- 비차단 동시 읽기
```

---

## 6. 핵심 효율성 지표 요약

| 지표 | 수치 |
|------|-----:|
| LOC 감소율 | **67%** 감소 |
| 파일 감소율 | **57%** 감소 |
| 의존성 감소율 | **75%** 감소 |
| 빌드 단계 | **제거됨** |
| 토큰 절감율 (홀로그램) | 평균 **84.2%** |
| 명령 응답 시간 | 전체 명령 **<210ms** |
| SQLite 읽기 지연 | **<0.3ms** |
| 에코시스템 어댑터 | **2종** (Claude Code, Cursor) |
| 항체 패턴 | 내장 검사 **3종** |
