# Deep Interview Spec: afd Developer's Roadmap — Trust-Builder to Self-Healing Workspace

## Metadata
- Interview ID: afd-roadmap-2026Q2
- Rounds: 8
- Final Ambiguity Score: 16%
- Type: brownfield
- Generated: 2026-04-02
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 35% | 0.315 |
| Constraint Clarity | 0.80 | 25% | 0.200 |
| Success Criteria | 0.80 | 25% | 0.200 |
| Context Clarity | 0.85 | 15% | 0.128 |
| **Total Clarity** | | | **0.843** |
| **Ambiguity** | | | **15.7%** |

## Goal

afd를 "에이전트 무개입 자율 코딩"을 지원하는 Self-Healing Workspace로 고도화한다. 3단계 로드맵(v1.5 → v1.6+ → v2.0)으로 점진적으로 진화시키며, v1.5 MVP "Trust-Builder"에서 핵심 신뢰 기반을 구축한다.

**핵심 철학:** "항체는 실력이고, HUD는 그 실력을 증명하는 신뢰의 언어다."

## Roadmap Overview

### v1.5 — "Trust-Builder" MVP
세 축으로 구성된 고신뢰 MVP:

#### 1. Hologram L1: Import-Based Semantic Compression
- **현재**: TS Compiler API로 모든 export 시그니처 추출 (80%+ 압축)
- **개선**: 현재 작업 파일의 import를 분석하여 N-Depth Reachability 적용
  - **L1 (직접 참조)**: import한 함수들 → 전체 시그니처 유지
  - **L1 외**: 시그니처 생략 또는 이름만 유지
- **가이드 텍스트**: 홀로그램에 "이 파일 외의 상세 구현은 생략됨. 필요시 직접 읽을 것" 안내 포함
- **기술**: 기존 TS Compiler API 확장 (Tree-sitter는 L2에서)

#### 2. Antibody Passive Defense: 실수 목록 프롬프트 주입
- **현재**: isCorrupted() + RFC 6902 패치로 복구만 수행
- **개선**: PreToolUse 시점에 해당 파일의 이전 실수 이력을 프롬프트에 주입
  - 형태: `"지난번 이 파일에서 '무한 루프' 실수를 했음. 주의할 것"`
  - 저장: `.afd/antibodies/` 또는 SQLite antibodies 테이블 확장
- **자동 밸리데이터 생성은 제외** (AI 환각 위험)
- **가성비 최고**: 텍스트 한 줄 주입만으로 에이전트 정답률 비약적 상승

#### 3. HUD: Counter + One-Line Reason
- **현재**: statusline-command.js로 `🛡️ afd: ON 🩹3` 표시
- **개선**: 방어 건수 + 사유 요약
  - 형태: `[afd] 3건의 실수를 막았습니다 (사유: 타입 불일치, 파일 삭제 방지)`
  - 사용자는 "왜 막았는지" 알아야 신뢰 시작
- **실시간 Diff는 제외** (터미널 UI 복잡도 과다)

### v1.6+ — "Deep Integration"
- OMC 훅 오케스트레이션 / Hook Manager
- 현재 배열 분리 방식(충돌 없음)에서 고도화
- afd가 다른 훅들을 관리하는 Hook Manager 내장 또는 표준 가이드 제시

### v2.0 — "Self-Healing Workspace"
- Hologram L2+: Tree-sitter 기반 전체 의존성 그래프, N-Depth Reachability 완성
  - L2 (간접 참조): 하위 모듈 → 이름+핵심 목적만
  - L3 (미사용): 현재 작업 흐름 외 → 완전 제거
  - 비유: "밟고 있는 땅은 선명하게, 가야 할 길은 약도로, 상관없는 곳은 안개로"
- 자동 밸리데이터 생성 (환각 방지 해결 후)
- 실시간 Diff 스트리밍 HUD
- 완전한 피드백 루프: 복구 → 원인 분석 → 에이전트 가이드
- "지휘자(OMC)가 미친 듯이 연주를 시켜도, 무대 감독(afd)이 무너지는 무대를 고쳐낸다"

## Constraints
- **릴리스 주기**: 완성도 기준 (시간 제한 없음)
- **런타임**: Bun only (Node.js/npm 금지)
- **DB**: bun:sqlite WAL mode
- **성능**: S.E.A.M < 270ms, 단일 파일 < 100ms
- **L1은 import 파싱만**: Tree-sitter 도입은 v2.0으로 연기
- **자동 밸리데이터 제외**: AI 환각 위험으로 MVP에서 배제
- **실시간 Diff 제외**: 터미널 UI 복잡도로 MVP에서 배제

## Non-Goals
- v1.5에서 전체 의존성 그래프 구축 (L2/L3)
- v1.5에서 자동 밸리데이터 JS 코드 생성
- v1.5에서 실시간 Diff UI 구현
- v1.5에서 OMC Hook Manager 통합

## Acceptance Criteria

### v1.5 Trust-Builder MVP
- [ ] `afd_hologram`이 현재 파일의 import를 분석하여 L1 참조 함수만 전체 시그니처로 반환
- [ ] 홀로그램 출력에 "생략된 구현은 직접 읽을 것" 가이드 텍스트 포함
- [ ] L1 적용 시 기존 80% 대비 추가 압축률 달성 (목표: 85%+)
- [ ] PreToolUse 훅에서 해당 파일의 이전 실수 이력을 프롬프트에 주입
- [ ] 실수 이력이 `.afd/antibodies/` 또는 DB에 구조화되어 저장
- [ ] HUD statusline에 방어 건수 + 한 줄 사유 표시
- [ ] 사유가 실제 방어 이벤트 (타입 불일치, 파일 삭제 등)에서 추출
- [ ] 기존 S.E.A.M 성능 제약 (270ms) 유지

### v1.6+ Deep Integration
- [ ] Hook Manager가 afd + OMC + 사용자 훅을 통합 관리
- [ ] 훅 순서 보장: afd(안전성) → OMC(라우팅) → 사용자
- [ ] 훅 충돌 자동 감지 및 경고

### v2.0 Self-Healing Workspace
- [ ] Tree-sitter 기반 L2/L3 N-Depth Reachability 동작
- [ ] 에이전트가 `afd start` 후 사용자 무개입으로 자율 코딩 가능
- [ ] 같은 실수 반복률 0% (항체 학습 완성)

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| HUD가 최우선이다 | 진짜 문제가 "보이지 않음"인가 "못 막음"인가? (Contrarian) | 항체=실력, HUD=증명. 둘은 계층 관계이지 경쟁이 아님 |
| 4개를 동시에 해야 한다 | 최소 성공 버전은? (Simplifier) | Trust-Builder MVP: L1 + Passive Defense + Counter+Reason |
| L2 전체 그래프가 필요하다 | L1만으로 충분한가? | L1이 import 파싱만으로 빠르고 가성비 최고. L2는 v2.0 |
| 자동 밸리데이터가 필요하다 | AI가 생성한 검증 코드의 환각 위험은? | Passive Defense(텍스트 주입)가 더 안전하고 효과적 |
| OMC 통합이 급하다 | 현재 배열 분리로 충돌 없는데? | v1.6+로 연기. 현재 방식으로 충분 |

## Technical Context (Brownfield)
- **Hologram**: `src/core/hologram.ts` — TS Compiler API 기반. `generateHologram()` 함수 확장 필요
- **Immune**: `src/core/immune.ts` + `rule-engine.ts` — `isCorrupted()`, antibodies 테이블 확장
- **HUD**: `.claude/statusline-command.js` — 카운터+사유 로직 추가
- **Hook**: `.claude/hooks.json` — `afd-auto-heal` 훅에 실수 이력 주입 로직 연결
- **MCP**: `src/daemon/mcp-handler.ts` — `afd_hologram` 도구에 L1 필터링 옵션 추가
- **DB**: `src/core/db.ts` — 실수 이력 테이블 추가 필요

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| afd | core system | version, state, S.E.A.M cycle | manages Hologram, Antibody, HUD |
| Hologram L1 | core feature | import graph, signatures, guide text, compression ratio | depends on S.E.A.M Extract phase |
| Antibody (Passive Defense) | core feature | file_path, mistake_type, mistake_description, timestamp | injects into PreToolUse hook |
| HUD (Counter+Reason) | core feature | heal_count, reasons[], display_format | reads from Antibody events |
| Hook Manager | planned feature | hook_registry, ordering, conflict_detection | orchestrates afd + OMC hooks |
| OMC | external system | hooks, agents, skills | parallel hook consumer |
| S.E.A.M Cycle | core mechanism | Sense, Extract, Analyze, Mutate | drives all afd operations |
| Trust-Builder MVP | milestone | v1.5, 3 pillars | bundles L1 + Passive Defense + Counter |
| Self-Healing Workspace | vision | v2.0, full autonomy | ultimate goal |
| N-Depth Reachability | algorithm | L1/L2/L3 depth levels, root node | powers Hologram compression |
| Prevention Record | concept | prevented_count, reasons, timestamps | displayed by HUD |
| Roadmap | plan | v1.5 → v1.6+ → v2.0 | organizes all features |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 7 | 7 | - | - | N/A |
| 2 | 8 | 1 | 0 | 7 | 87% |
| 3 | 9 | 1 | 0 | 8 | 89% |
| 4 | 9 | 0 | 0 | 9 | 100% |
| 5 | 10 | 1 | 0 | 9 | 90% |
| 6 | 11 | 1 | 0 | 10 | 91% |
| 7 | 12 | 1 | 2 | 9 | 92% |
| 8 | 12 | 0 | 0 | 12 | 100% |

Ontology fully converged at Round 8 — all 12 entities stable.

## Interview Transcript
<details>
<summary>Full Q&A (8 rounds)</summary>

### Round 1
**Q:** 이 4가지를 모두 v1.5.0 하나에 넣으려는 건가요, 아니면 우선순위를 정해서 한두 개부터 착수하는 건가요?
**A:** 전체 로드맵 수립 — 4개 모두 단계별로 계획해서 v1.5~v2.0까지 로드맵으로 정리
**Ambiguity:** 77% (Goal: 0.30, Constraints: 0.10, Criteria: 0.10, Context: 0.50)

### Round 2
**Q:** 각 버전의 릴리스 주기를 어떻게 생각하세요?
**A:** 완성도 기준 — 시간 제한 없이 기능이 다 되면 릴리스
**Ambiguity:** 70% (Goal: 0.35, Constraints: 0.30, Criteria: 0.10, Context: 0.55)

### Round 3
**Q:** Self-Healing Workspace가 완성됐다고 판단할 수 있는 구체적인 시나리오가 있나요?
**A:** 에이전트 무개입 자율 코딩 — afd start 후 사용자가 신경 쓸 일이 없는 상태
**Ambiguity:** 61% (Goal: 0.40, Constraints: 0.30, Criteria: 0.35, Context: 0.60)

### Round 4
**Q:** 현재 afd v1.4.0을 쓰면서 가장 답답한 순간이 언제인가요?
**A:** 시각적 불안 — afd가 제대로 동작하는지 사용자가 확인하기 어려움
**Ambiguity:** 55% (Goal: 0.45, Constraints: 0.45, Criteria: 0.35, Context: 0.65)

### Round 5 [Contrarian Mode]
**Q:** 혹시 진짜 문제는 'afd가 보이지 않는 것'이 아니라 'afd가 충분히 막지 못하는 것'은 아닌가요?
**A:** "항체는 실력이고, HUD는 그 실력을 증명하는 신뢰의 언어다." HUD는 방어의 전적지. 사용자는 '문제가 생길 뻔했으나 가디언이 제압했음을 인지하는 순간' 신뢰를 느낀다.
**Ambiguity:** 43% (Goal: 0.65, Constraints: 0.45, Criteria: 0.50, Context: 0.70)

### Round 6 [Simplifier Mode]
**Q:** 시맨틱 압축에서 '호출 여부'를 판단하는 기준이 뭔가요?
**A:** N-Depth Reachability — Tree-sitter로 전체 그래프를 그리되 현재 파일을 루트로 깊이 제한. L1(직접)=선명, L2(간접)=약도, L3(미사용)=안개. "밟고 있는 땅은 선명하게, 가야 할 길은 약도로, 상관없는 곳은 안개로."
**Ambiguity:** 34% (Goal: 0.75, Constraints: 0.65, Criteria: 0.50, Context: 0.75)

### Round 7
**Q:** 4개 영역 각각의 '최소 성공 버전'을 상상해보면?
**A:** "The Trust-Builder" MVP — (1) 홀로그램 L1 + 가이드 텍스트 (2) 항체 Passive Defense: 실수 목록 프롬프트 주입 (3) HUD Counter + 한 줄 사유. 자동 밸리데이터는 환각 위험, 실시간 Diff는 UI 복잡도로 제외.
**Ambiguity:** 21% (Goal: 0.85, Constraints: 0.75, Criteria: 0.75, Context: 0.80)

### Round 8
**Q:** OMC Deep Integration은 로드맵 어디에 놓이나요?
**A:** 후속 버전 (v1.6+) — 현재 배열 분리로 충돌 없이 동작 중이므로 급하지 않음
**Ambiguity:** 16% (Goal: 0.90, Constraints: 0.80, Criteria: 0.80, Context: 0.85)

</details>
