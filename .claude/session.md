# Session Context

> 마지막 업데이트: 2026-04-03 | 브랜치: main

## 현재 상태
- 버전: **v1.8.0-ALPHA: Native MCP Integrated** 🔧 (MCP Phase 2 도구 3종 구현 완료)
- 홀로그램 지원 언어: TypeScript/JS (full) · Python (L0) · Go (full) · Rust (full)
- 모든 테스트: **193/193 통과** (12 신규: correlation-engine) | 빌드: **75모듈**
- Working tree: **dirty** (미커밋 작업 다수 — 커밋 대기)

## v1.7.0 구현 현황 — 전체 완료 ✅

| 항목 | 상태 | 핵심 파일 |
|---|---|---|
| Remote vaccine store (`afd sync --remote`) | ✅ | `src/commands/sync.ts` |
| Team antibody federation (scope namespace) | ✅ | `src/core/federation.ts` |
| Antibody versioning + RWIN conflict resolution | ✅ | `src/core/federation.ts`, `src/daemon/http-routes.ts` |
| Auto-validator generation from quarantine | ✅ | `src/core/validator-generator.ts` |
| Rule suggestion engine (`afd suggest`) | ✅ | `src/core/rule-suggestion.ts`, `src/commands/suggest.ts` |
| **Cross-project pattern correlation** | ✅ | `src/core/correlation-engine.ts`, `src/commands/correlate.ts` |

## ⭐ v1.8.0 진행 현황

| 항목 | 상태 | 파일 |
|---|---|---|
| `afd_suggest` MCP tool | ✅ | `src/daemon/mcp-handler.ts` |
| `afd_fix` MCP tool | ✅ | `src/daemon/mcp-handler.ts` |
| `afd_sync` MCP tool | ✅ | `src/daemon/mcp-handler.ts` |
| MCP resource `afd://antibodies` | ✅ | `src/daemon/mcp-handler.ts` |
| Cross-daemon HTTP bridge | ✅ | `src/daemon/http-routes.ts`, `src/commands/sync.ts` |

MCP 등록 명령: `afd mcp install` (`.mcp.json` + `~/.claude.json` 자동 업데이트)

## 멀티-세션 협업 프로토콜
- 세션 식별: `export CLAUDE_SESSION_ID=@Session-1` (각 터미널에서 실행)
- 작업 점유: `[/] @Session-1` 마커로 docs/roadmap.md 항목 클레임
- 세션 상태: `.claude/session-lock.md` 참조
- 이 세션은 **@Session-1 (Coordinator)** 로 등록됨

## Cross-Project Pattern Correlation (신규 구현)

### src/core/correlation-engine.ts
- `correlatePatterns(db, opts)`: antibodies 테이블에서 multi-scope 집계
  - scope != 'local' 필터 (원격 federated antibodies 대상)
  - Greedy Jaccard clustering: pattern_type 토큰화 → 유사도 ≥ threshold 시 클러스터 합산
  - `GlobalHotspot`: canonicalType, variants, scopeCount, scopes, totalOccurrences, confidence
  - 결과: scopeCount DESC, totalOccurrences DESC 정렬
- `findMatchingHotspot(mistakeType, hotspots)`: suggest --cross 연동용 유사도 검색

### src/commands/correlate.ts
- `afd correlate`: 글로벌 핫스팟 박스 UI 표시
- `afd correlate --apply`: 미보호 핫스팟에 글로벌 validator 자동 생성
- `afd correlate --min-scopes <n>`: 최소 스코프 수 임계값 설정
- `afd correlate --include-local`: 로컬 스코프 포함 분석

### suggest.ts 확장
- `afd suggest --cross`: `correlatePatterns()` 호출 → 각 suggestion에 `🌐 Community Verified` 배지
- `findMatchingHotspot()` 연동: mistakeType 유사도 ≥ 0.35 시 배지 표시

## 기억할 사항
- web-tree-sitter named export: `import { Parser, Language } from "web-tree-sitter"`
- WASM 경로: `require.resolve("tree-sitter-{lang}/package.json")` → dirname → `tree-sitter-{lang}.wasm`
- bun install 필수: 클론/풀 후 반드시 실행 (WASM 패키지 미설치 시 start 실패)
- `mistake_type`은 English enum으로 저장, HUD 표시 시 한국어 변환
- `file_path`는 항상 workspace-relative POSIX (`src/core/db.ts` 형식)로 정규화
- tree-sitter-go AST: interface methods → `interface_type`의 직접 namedChildren (interface_body 래퍼 없음)
- tree-sitter-rust AST: impl body → `declaration_list`, function body → `block`
- Remote sync API 계약: POST `<url>` (push), GET `<url>` (pull), Content-Type: application/json
- Federation scope: 비로컬 antibody는 fqid(`scope/id`)를 id 컬럼에 저장 (PK 변경 없음)
- RWIN: version 비교 → updatedAt 비교(ISO string 사전순) → 동점 시 local 유지
- `resolveScope()`: `Bun.spawnSync(["git", "remote", "get-url", "origin"])` 사용 (child_process 금지)
- `bun:sqlite` in-memory DB → Windows에서 segfault 발생. 테스트는 파일 기반 DB + `journal_mode=DELETE` 사용
- Correlation engine stop tokens: "pattern"이 stop token이므로 `pattern-type-N` 형태 테스트 데이터 금지 → 모두 `{"type"}`으로 토큰화되어 1개 클러스터로 합산됨
