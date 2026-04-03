# Deep Interview Spec: afd Token Savings Dashboard

## Metadata
- Interview ID: afd-dashboard-2026-04-03
- Rounds: 5
- Final Ambiguity Score: 16.3%
- Type: brownfield
- Generated: 2026-04-03
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.75 | 0.25 | 0.188 |
| Success Criteria | 0.80 | 0.25 | 0.200 |
| Context Clarity | 0.90 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.838** |
| **Ambiguity** | | | **16.3%** |

## Goal
Claude Code로 코딩하는 동안 별도 터미널에 실시간으로 afd의 토큰 절약 현황을 시각화하는 **`afd dashboard`** 명령어를 구현한다. 사용자가 파일을 저장할 때마다 S.E.A.M 이벤트 push를 통해 자동 갱신되며, 홀로그램 압축 절약 + 자가치유 절약 + 달러 환산값을 ASCII 바 차트로 표시한다.

## Constraints
- **런타임**: Bun 전용 (Node.js/npm 금지)
- **진입점**: 신규 `afd dashboard` 커맨드 (`src/commands/dashboard.ts`)
- **업데이트 메커니즘**: S.E.A.M 이벤트 push (afd://events, v1.9.0 기존 인프라)
  - HTTP polling 금지 — 이벤트 드리븐 전용
- **데이터 소스**:
  - `/shift-summary` HTTP endpoint (hologramTokensSaved + healTokensSaved + totalCostSaved)
  - `hologram_daily` SQLite 테이블 (7일 롤링 히스토리)
  - `hologram_lifetime` SQLite 테이블 (누적)
- **TUI**: Bun 호환 터미널 렌더링 (raw ANSI escape codes 또는 Bun 네이티브 스트림)
  - Windows (cmd/PowerShell) Unicode 호환 유지
- **실행 맥락**: 별도 터미널에서 실행 — Claude Code와 나란히 사용

## Non-Goals
- 웹 브라우저 UI 없음
- VS Code 익스텐션/패널 없음
- `afd score` 명령어 수정 없음 (기존 one-shot 유지)
- 실제 LLM API 토큰 수집 로직 없음 (추정값 기반으로 충분)
- 인터랙티브 조작 없음 (읽기 전용 뷰)

## Acceptance Criteria
- [ ] `afd dashboard` 명령 실행 시 TUI 대시보드가 뜨고 Ctrl+C로 종료
- [ ] 파일 저장 시 < 270ms 내에 수치가 갱신됨 (S.E.A.M 이벤트 기반)
- [ ] **오늘 절약** 섹션: 원본 토큰(A) vs 실제 토큰(B) 바 차트 표시
- [ ] **절약 비용** 달러 환산값 표시 (hologram + heal 합산)
- [ ] **7일 히스토리** 바 차트: 날짜별 절약률(%) 표시
- [ ] 데몬이 꺼져 있을 때 graceful 메시지 출력 (no crash)
- [ ] Windows 터미널에서 깨지지 않는 ASCII 문자 사용

## Technical Context
### 기존 데이터 소스 (활용 가능)
```
GET /shift-summary → {
  hologramTokensSaved: number,
  healTokensSaved: number,
  totalTokensSaved: number,
  totalCostSaved: number,
  totalMinutesSaved: number,
  suppressionsSkipped: number
}

GET /score → {
  uptime: string,
  hologram: { requests, savedPercent, dailyBreakdown[] },
  immune: { antibodies, autoHealed, accuracy }
}

SQLite hologram_daily: { date, total_original_chars, total_hologram_chars, requests }
SQLite hologram_lifetime: { total_original_chars, total_hologram_chars, total_requests }
```

### 이벤트 push 인프라 (v1.9.0)
```
MCP afd://events resource → notifications/resources/updated
→ TUI가 구독 후 갱신 신호 수신 → HTTP /shift-summary 재조회
```

### 새 파일
```
src/commands/dashboard.ts  — 신규 커맨드 진입점
```

### 수정 파일
```
src/index.ts (또는 CLI 라우터) — dashboard 커맨드 등록
```

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Dashboard | core domain | command, renderLoop, eventSubscription | owns TokenSaving, HealSaving, CostSaving |
| TokenSaving | core domain | originalTokens(A), actualTokens(B), savedPercent | part of Dashboard |
| HealSaving | supporting | healTokensSaved, healCostSaved | part of CostSaving |
| CostSaving | supporting | totalCostSaved, hologramCost, healCost | aggregates TokenSaving + HealSaving |
| EventPush | external system | afd://events, notifications/resources/updated | triggers Dashboard refresh |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|-------|-------------|-----|---------|--------|-----------|
| 1 | 3 | 3 | - | - | N/A |
| 2 | 4 | 2 | 0 | 2 | 50% |
| 3 | 5 | 1 | 0 | 4 | 80% |
| 4 | 5 | 0 | 0 | 5 | 100% |
| 5 | 5 | 0 | 0 | 5 | 100% |

## UI Wireframe (ASCII)
```
╔══════════════════════════════════════════════════╗
║  afd dashboard  [live ●]         2026-04-03      ║
╠══════════════════════════════════════════════════╣
║  TODAY TOKEN SAVINGS                             ║
║  Original  ████████████████████  8,400 tok       ║
║  Actual    ████████░░░░░░░░░░░░  3,200 tok       ║
║  Saved     ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░   62%  ($0.50)  ║
╠══════════════════════════════════════════════════╣
║  7-DAY HISTORY (% saved)                         ║
║  03-28  ████ 45%                                 ║
║  03-29  ████████ 70%                             ║
║  03-30  ██████ 58%                               ║
║  03-31  ██████████ 80%                           ║
║  04-01  ███████ 62%                              ║
║  04-02  █████ 51%                                ║
║  04-03  ████████████ 62% ← today                 ║
╠══════════════════════════════════════════════════╣
║  LIFETIME  total saved: 42,300 tok  ($12.47)     ║
║  sessions: 34  |  files touched: 128             ║
╚══════════════════════════════════════════════════╝
  [waiting for events...]   Ctrl+C to exit
```

## Interview Transcript
<details>
<summary>Full Q&A (5 rounds)</summary>

### Round 1
**Q:** 이 대시보드를 어디서 보고 싶으세요? (그래프 렌더링 방식이 완전히 달라집니다)
**A:** 터미널 TUI
**Ambiguity:** 60% (Goal: 0.50, Constraints: 0.30, Criteria: 0.20, Context: 0.70)

### Round 2
**Q:** 대시보드에서 보고 싶은 'A → B 절약'이 정확히 어떤 건가요?
**A:** 둘 다 + 비용 환산 (hologram + heal, 달러 환산)
**Ambiguity:** 44% (Goal: 0.65, Constraints: 0.35, Criteria: 0.55, Context: 0.75)

### Round 3
**Q:** '실시간'이 어느 수준을 의미하나요?
**A:** S.E.A.M 이벤트 push — 파일 저장 시마다 자동 갱신
**Ambiguity:** 34% (Goal: 0.70, Constraints: 0.65, Criteria: 0.55, Context: 0.80)

### Round 4 (Contrarian)
**Q:** [Contrarian] 실시간 push가 진짜 필요한가? 코딩 중 계속 보는 게 현실적인가?
**A:** Claude 코딩 중 다른 터미널에 돌려놓기 — push 실시간 필요
**Ambiguity:** 24% (Goal: 0.80, Constraints: 0.70, Criteria: 0.70, Context: 0.85)

### Round 5
**Q:** `afd score --live` 확장 vs 신규 `afd dashboard` 커맨드?
**A:** 신규 `afd dashboard` (src/commands/dashboard.ts)
**Ambiguity:** 16.3% ✓ PASSED

</details>
