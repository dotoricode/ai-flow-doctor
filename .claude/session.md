# Session Context

> 마지막 업데이트: 2026-04-03 | 브랜치: main | 나이트 시프트 완료 ✅

## 현재 상태
- 버전: **v1.9.0 READY-FOR-TEST: MCP Phase 3 — Real-time Notification Mesh**
- 최신 커밋: `b2e7957` — feat(mcp): implement MCP Phase 3 real-time notification mesh
- 전체 테스트: **193/193 통과** | 빌드: 성공
- Working tree: clean (roadmap.md + session.md 미커밋 — 세션 정리용)

## 나이트 시프트 완료 요약

### 구현된 v1.9.0 기능 (4단계 전부 완료)

| 단계 | 내용 | 상태 |
|------|------|------|
| Step 1 | SubscriptionManager 모듈, capabilities.subscribe, subscribe/unsubscribe 핸들러 | ✅ |
| Step 2 | insertAntibody → afd://antibodies 알림, quarantineFile → afd://quarantine 알림, autoHealFile → notifications/message | ✅ |
| Step 3 | afd://events SEAM 브리지, afd://history/{path} URI 템플릿, list_changed 발송 | ✅ |
| Step 4 | CLAUDE.md Section 10: MCP 알림 프로토콜 에이전트 규칙 추가 | ✅ |

### 신규 파일
- `src/daemon/mcp-subscriptions.ts` — SubscriptionManager 싱글톤

### 변경된 파일
- `src/daemon/mcp-handler.ts` — subscribe 지원, 신규 리소스 4종
- `src/daemon/types.ts` — SeamEventEntry, QuarantineLogEntry, DaemonState 확장
- `src/daemon/server.ts` — SEAM 로거 브리지, insertAntibodyAndNotify 래퍼, quarantineFile 훅, autoHealFile 훅
- `src/daemon/http-routes.ts` — /antibodies/learn 후 afd://antibodies 알림
- `CLAUDE.md` — Section 10 MCP 알림 프로토콜 추가

## v1.9.0 아키텍처 요약

### MCP 알림 흐름
```
[daemon 내부 이벤트]
  insertAntibody() ──→ subscriptionManager.dispatchResourceUpdated("afd://antibodies")
  quarantineFile() ──→ subscriptionManager.dispatchResourceUpdated("afd://quarantine")
  autoHealFile()   ──→ subscriptionManager.dispatchMessage("warning", "[afd] {path} 파일의 자가 치유가 완료되었습니다")
  seam() (모든 이벤트) ──→ subscriptionManager.dispatchResourceUpdated("afd://events")
  insertEvent()    ──→ subscriptionManager.dispatchResourceUpdated("afd://history/{path}")
```

### 구독 가능한 리소스
| URI | 업데이트 트리거 |
|-----|----------------|
| `afd://antibodies` | 항체 삽입/업데이트 시 |
| `afd://quarantine` | 파일 격리 시 |
| `afd://events` | S.E.A.M 이벤트 발생 시 (링 버퍼 200개) |
| `afd://history/{path}` | 해당 경로에 파일시스템 이벤트 발생 시 |

### SubscriptionManager (src/daemon/mcp-subscriptions.ts)
- 모듈 수준 싱글톤 (`subscriptionManager`)
- `enable()` — MCP stdio 모드 활성화 (HTTP 모드에서 no-op)
- `dispatchResourceUpdated(uri)` — 구독 중인 URI에만 알림 발송
- `dispatchListChanged()` — 신규 동적 리소스 목록 변경 알림
- `dispatchMessage(level, data)` — 자유 형식 메시지 알림

## 다음 세션 시작 시 확인 사항
1. `npm test` 실행 — 193/193 확인
2. `afd start --mcp` 로 MCP 모드 수동 테스트
3. Claude Code에서 `resources/subscribe`로 `afd://antibodies` 구독 테스트
