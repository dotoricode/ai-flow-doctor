# Session Context

> 마지막 업데이트: 2026-04-02 | 브랜치: main

## 완료된 작업 (오늘)
- Tree-sitter 기반 홀로그램 엔진 전면 교체 (TS compiler API → web-tree-sitter WASM)
  - 다국어 지원: TypeScript/JS, Python (Go/Rust는 L0 fallback)
  - `src/core/hologram/` 서브모듈 구조로 리팩터: engine, types, ts-extractor, py-extractor, fallback, incremental
  - 모든 call site async/await 마이그레이션 완료 (mcp-handler, http-routes, server, benchmark)
- Incremental Hologram (diff-only 모드) 구현
  - LCS 기반 unified diff 포맷 (changedNodes, isDiff 필드 추가)
  - True LRU 캐시 (최대 200 엔트리, delete+reinsert on access)
  - LCS guard: n*m > 50,000 → full diff fallback (SEAM 270ms 예산 보호)
- EventBatcher 구현 (`src/daemon/event-batcher.ts`)
  - 300ms 디바운스, immune 파일 fast-path (즉시 처리)
  - dedup (last-event-wins), add+unlink 상쇄 처리
  - flush(), destroy(), pendingCount, totalBatches 통계
- server.ts에 EventBatcher 통합
- 테스트 3종 추가: hologram-treesitter (13개), event-batcher (7개), hologram-incremental (10개)
- Lean Mode 적용: `.claude/settings.json`에 `permissions.deny` 추가 (7개 불필요 도구 명시 차단)
  - 차단: python_repl, ast_grep_*, lsp_code_actions, lsp_code_action_resolve, lsp_prepare_rename, lsp_servers
- file_path 경로 정규화: `server.ts:175` mistakeCache 웜업 시 `row.file_path.replace(/\\/g, "/")` 추가
- Tree-sitter 벤치마크 실행 및 README/README-ko.md 수치 최신화
  - 55파일, 압축률 84%, 원본 290KB→46.3KB, 토큰 절약 ~60,927개, 처리시간 268ms
  - 구버전(94%, ~26,900 tokens) → 신버전(84%, ~60,900 tokens) 전면 교체
  - 영/한 문서 수치 100% 동기화 완료
- Windows/Mac 양쪽 호환 statusline 수정 (`D:/.claude/statusline-command.js`)
  - Windows: wmic으로 afd 프로세스 감지, ASCII 지표 사용
  - 경로 이식성: $HOME 변수 사용
- `web-tree-sitter` 패키지 미설치 에러 해결 → `bun install`로 수정
- `docs/troubleshooting.md` 신규 생성 (오류 누적 기록용)

## 커밋 이력 (오늘)
- `cccebac` feat(hologram): replace TS compiler with tree-sitter engine + add incremental batching
- `de7a26b` feat(cli): add afd benchmark command
- `cd9c59d` docs: remove afd watch references from all docs
- `9e14112` docs(readme): update token savings with latest measurements
- `55ea296` docs(readme): streamline README with token savings data, sync ko/en
- `4b060fd` feat(hologram): implement smart bypass & L1 symbol extraction
- `bdefd2b` docs: sync benchmarks with tree-sitter engine & add troubleshooting guide
- `d531126` chore(config): apply lean mode mcp settings & update session
- `0a30b40` docs(roadmap): add v1.6.1 entries for smart bypass & L1 symbol extraction
- ✅ v1.7 베이스라인 확보 커밋 (chore: secure baseline for v1.7)

## 현재 상태
- 버전: v1.6.1 (Smart Bypass + L1 Symbol Extraction)
- 홀로그램 엔진: web-tree-sitter WASM 기반, TS+Python 지원
- 배치 처리: 10파일 × 10ms → 1 batch 확인됨
- 벤치마크 (최신): 55파일, 84% 압축, ~60,927 토큰 절약, 268ms
- 모든 테스트: 145/145 통과
- Lean Mode: permissions.deny 적용 완료 (7개 도구 차단)
- Working tree: **clean** (미커밋 변경사항 없음)

## 완료된 P1 작업
- ✅ **Go extractor 구현** (`src/core/hologram/go-extractor.ts`)
  - tree-sitter-go@0.25.0 WASM 바인딩, package/import/type/func/method 추출
  - 9개 신규 테스트, 전체 154/154 통과
  - roadmap.md에 v1.6.2 섹션 추가

## 현재 상태
- 버전: v1.6.2 (Go Extractor)
- 홀로그램 지원 언어: TypeScript/JS (full), Python (L0), **Go (full)**, Rust (L0)
- 모든 테스트: 154/154 통과

## 완료된 P1 작업 (추가)
- ✅ **Open Questions 5건 결정** (`.omc/plans/open-questions.md`)
  - Q1: mistake_type → **English enum** in DB, Korean at HUD render
  - Q2: defense count → **session in-memory** reset, lifetime via `afd score`
  - Q3: retention → **90일** (db.ts:97 purge 30d→90d 업데이트 필요)
  - Q4: barrel file L1 → **v2.0 defer**, L0 fallback final for v1.x
  - Q5: file_path → **workspace-relative POSIX** (`src/core/db.ts` 형식)

## ⭐ 다음 최우선 과제 (P1): Q3 결정 코드 반영
- `src/core/db.ts:97` — purge threshold `30 * 86400000` → `90 * 86400000`
- 영향 범위: 1줄 변경, 테스트 불필요 (숫자 상수 변경)

## 기타 작업 후보 (P2~P3)
- v1.5 계획서 체크박스 갱신 (코드 완료, 문서 미반영)
- Rust extractor 추가 (tree-sitter-rust WASM, Go extractor 패턴 참조)
- v1.7.0 Collective Intelligence 구현 착수

## 기억할 사항
- web-tree-sitter는 named export: `import { Parser, Language } from "web-tree-sitter"`
- WASM 경로: `require.resolve("tree-sitter-typescript/package.json")` → dirname → `tree-sitter-typescript.wasm`
- v1.4.0 Collective Intelligence는 에이전트 팀 간 자동 항체 공유로 방향 전환
- bun install 필수: 클론/풀 후 반드시 실행 (web-tree-sitter 등 미설치 시 start 실패)
- mistakeCache의 file_path는 항상 forward slash로 정규화됨 (INSERT·SELECT·웜업 모두 적용)
