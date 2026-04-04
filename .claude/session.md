# Session Context

> 마지막 업데이트: 2026-04-04 | 브랜치: main

## 현재 상태
- 버전: **v2.0.0-dev** (npm published: v1.9.1)
- 최신 커밋: `7c47dfb` — chore(session): final session cleanup
- 전체 테스트: **195/195 통과** | 빌드: **0.58MB**
- Working tree: **수정됨** (N-Depth 버그 픽스 + 로드맵 업데이트, 미커밋)

## 미커밋 변경사항 (이번 세션)

| 파일 | 변경 내용 |
|---|---|
| `src/core/hologram/call-graph.ts` | JSX 컴포넌트 탐지 추가, extractSignature 단어경계 매칭 수정 |
| `src/core/hologram/engine.ts` | tsx WASM 경로 매핑 (`GRAMMAR_PACKAGE_MAP`) |
| `src/core/hologram/grammar-resolver.ts` | **신규** — .tsx/.jsx → tsx 문법 자동 선택 |
| `src/core/hologram.ts` | resolveGrammar 적용, 순환참조 방지 |
| `src/core/hologram/ts-extractor.ts` | grammarName 주석 보강 |
| `docs/roadmap.md` | v2.0.0-dev 마일스톤 신설, Future → v2.x Next Targets |
| `tests/fixtures/n-depth-demo/` | **신규** — N-Depth 렌더링 검증용 더미 React 프로젝트 |

## 세션 커밋 이력 (이전 세션 포함, 11개)

| 커밋 | 내용 |
|---|---|
| `44fc2cd` | fix(ctx-savings): wsmap/pinpoint 정확한 추적 |
| `6428a2e` | feat(dashboard): `afd dashboard` TUI + 한국어 locale |
| `49474b2` | release(v1.9.0): 버전 동기화 + 로드맵 정리 |
| `93669ab` | chore(release): v1.x 안정화 |
| `fbadc58` | fix(bin): bun shebang 진입점 추가 |
| `c9f25b3` | release(v1.9.1): npm publish |
| `6be16f9` | refactor(v2-prep): 가지치기 (-975줄, -30MB dep) |
| `2b17659` | feat(hologram): N-Depth Reachability L2/L3 구현 |
| `5c1d9b1` | feat(hologram): barrel file re-export 추적 |
| `b8a9fbf` | chore(session): 세션 상태 동기화 |
| `7c47dfb` | chore(session): 세션 최종 정리 |

## 이번 세션 수행 작업
1. **N-Depth 실전 렌더링 테스트**: 더미 React 프로젝트(App.tsx → components/index.ts → Button.tsx, Input.tsx) 구성 후 홀로그램 추출 검증
2. **버그 3건 발견 및 수정**:
   - `extractSignature` substring 매칭 → `\b` 단어경계 정규식
   - JSX 컴포넌트(`<Button />`) call graph 미탐지 → `jsx_self_closing_element`/`jsx_opening_element` child(1) 추출
   - `.tsx` 파일 tsx 문법 미적용 → `grammar-resolver.ts` 분리, engine WASM 경로 매핑
3. **로드맵 v2.0.0-dev 마일스톤 공식화**: N-Depth, Barrel, TSX 안정화 15항목 기록, Future를 v2.x Next Targets로 구체화

## 핵심 변화 수치

| 지표 | Before | After |
|---|---|---|
| 빌드 크기 | 9.43MB | 0.58MB (-94%) |
| CLI 커맨드 | 20개 | 14개 (-30%) |
| dependencies | 6개 | 3개 (-50%) |
| 테스트 | 193개 | 195개 |
| npm | 미배포 | v1.9.1 published |

## 신규 파일 (프로젝트 전체)

| 파일 | 역할 |
|---|---|
| `src/core/hologram/grammar-resolver.ts` | tsx/jsx 문법 자동 선택 유틸 |
| `src/core/hologram/import-resolver.ts` | TS/JS import 경로 해석 + barrel 추적 |
| `src/core/hologram/call-graph.ts` | Tree-sitter call graph L2/L3 추적 |
| `src/commands/dashboard.ts` | `afd dashboard` live TUI |
| `tests/fixtures/n-depth-demo/` | N-Depth 홀로그램 렌더링 테스트 픽스처 |

## 다음 세션 시작 시 확인 사항
1. **미커밋 변경 커밋**: 위 테이블의 변경사항 커밋 필요 (버그 픽스 3건 + 로드맵 + 테스트 픽스처)
2. MCP `afd_hologram` / `afd_read`에 `nDepth` 파라미터 노출 구현
3. v2.0.0 로드맵 추가 항목 검토: Python/Go/Rust N-Depth, L3 전이 추적
4. `afd start` 후 데몬 정상 기동 확인 (가지치기 후 첫 풀 사이클)
