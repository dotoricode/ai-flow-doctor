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
- 전체 145개 테스트 통과

## 커밋 이력 (오늘)
- `cccebac` feat(hologram): replace TS compiler with tree-sitter engine + add incremental batching
- `de7a26b` feat(cli): add afd benchmark command
- `cd9c59d` docs: remove afd watch references from all docs
- `9e14112` docs(readme): update token savings with latest measurements
- `55ea296` docs(readme): streamline README with token savings data, sync ko/en

## 현재 상태
- 버전: v1.6.0 (Hook Manager)
- 홀로그램 엔진: web-tree-sitter WASM 기반, TS+Python 지원
- 배치 처리: 10파일 × 10ms → 1 batch 확인됨
- 모든 테스트: 145/145 통과

## 다음 작업 후보
- Go extractor 추가 (현재 L0 fallback)
- Hook Manager v1.6 구현 (`.omc/plans/` 참고)
- benchmark 수치 업데이트 (tree-sitter 기반으로 재측정)

## 기억할 사항
- web-tree-sitter는 named export: `import { Parser, Language } from "web-tree-sitter"`
- WASM 경로: `require.resolve("tree-sitter-typescript/package.json")` → dirname → `tree-sitter-typescript.wasm`
- v1.4.0 Collective Intelligence는 에이전트 팀 간 자동 항체 공유로 방향 전환 (memory에 저장됨)
- benchmark 결과: 48파일, 84.8% 압축률, ~56K 토큰 절약, 179ms
