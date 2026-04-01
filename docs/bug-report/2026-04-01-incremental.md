# AFD 증분 버그 감사 리포트

- **감사일**: 2026-04-01
- **대상 커밋**: `0c7e512` (main)
- **이전 태그**: `BUG-AUDIT-2026-04-01`
- **감사 범위**: 변경 파일 3개
  - `src/daemon/server.ts`
  - `src/commands/watch.ts`
  - `tests/unit/mcp-protocol.test.ts`

---

## 요약

| 심각도 | 건수 |
|--------|------|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 6 |
| LOW | 3 |
| **합계** | **11** |

---

## HIGH (2건)

### H-16. `afd_read` MCP 도구 — 경로 탐색 (임의 파일 읽기)
- **위치**: `src/daemon/server.ts:890`
- **분류**: 보안
- **설명**: 새로 추가된 `afd_read` MCP 도구가 `resolve(file)`을 워크스페이스 경계 검증 없이 호출. `afd_read({ file: "../../../etc/passwd" })`로 시스템 파일 읽기 가능. 기존 C-01과 동일 클래스의 취약점이 **새 코드 경로**에서 재발.
- **수정**: `resolve(file)` 후 워크스페이스 루트 내부인지 검증. `assertInsideWorkspace()` 공통 헬퍼 도입.

### H-17. `/read` HTTP 엔드포인트 — 경로 탐색
- **위치**: `src/daemon/server.ts:1025`
- **분류**: 보안
- **설명**: 새로 추가된 `GET /read?file=...` 엔드포인트도 동일한 경로 탐색 취약점. H-16과 동일 패턴.
- **수정**: H-16과 동일.

---

## MEDIUM (6건)

### M-29. `afd_read` — 전체 파일 로드 후 라인 슬라이싱
- **위치**: `src/daemon/server.ts:891, 898`
- **분류**: 성능 / DoS
- **설명**: `startLine`/`endLine` 지정 시에도 전체 파일을 메모리에 읽은 후 슬라이스. 대형 파일(minified JS 등)에서 불필요한 메모리 소비.
- **수정**: 파일 크기 상한(10MB) 추가 또는 스트리밍 방식 고려.

### M-30. `afd_read` — `startLine`/`endLine` 타입 미검증
- **위치**: `src/daemon/server.ts:893-894`
- **분류**: 로직 오류
- **설명**: MCP JSON-RPC 인자가 문자열이나 음수일 수 있으나 `as number`로 캐스트만 수행. `Math.floor("abc")` → `NaN` → `lines.slice(NaN, NaN)` → 전체 파일 반환.
- **수정**: `Number.isFinite()` 검증 추가. 양의 정수가 아니면 에러 반환.

### M-31. `/read` HTTP — `parseInt` NaN 미처리
- **위치**: `src/daemon/server.ts:1032-1033`
- **분류**: 로직 오류
- **설명**: `parseInt("notanumber")` → `NaN` → `Math.max(1, NaN)` → `NaN` → 빈 응답(에러 메시지 없음).
- **수정**: `Number.isFinite()` 검증 후 400 반환.

### M-32. `buildWorkspaceMap` — 동기 재귀 디렉토리 탐색이 이벤트 루프 블로킹
- **위치**: `src/daemon/server.ts:632-663`
- **분류**: 성능
- **설명**: `readdirSync`/`statSync`/`readFileSync`를 재귀 호출. 대형 워크스페이스에서 수백 ms 블로킹 → 270ms 지연 목표 위반 가능.
- **수정**: 비동기 전환 또는 워커 스레드 사용. 최소한 재귀 깊이 제한.

### M-33. `buildWorkspaceMap` — 심링크 순환 보호 없음
- **위치**: `src/daemon/server.ts:632-663`
- **분류**: DoS / 크래시
- **설명**: `statSync`는 심링크를 따라감. `src/a → src/` 같은 순환 심링크 시 무한 재귀 → 스택 오버플로우.
- **수정**: `lstatSync`로 심링크 감지 후 스킵, 또는 재귀 깊이 상한.

### M-34. MCP 테스트 — 도구 개수 하드코딩
- **위치**: `tests/unit/mcp-protocol.test.ts:82`
- **분류**: 테스트 취약성
- **설명**: `expect(tools.length).toBe(4)` — 도구 추가 시마다 실패. 개별 `toContain` 검증이 이미 있어 중복.
- **수정**: 제거하거나 `toBeGreaterThanOrEqual(4)`로 변경.

---

## LOW (3건)

### L-20. `mapRefreshTimer` cleanup 미등록
- **위치**: `src/daemon/server.ts:625, 691`
- **분류**: 리소스 누수
- **설명**: `setTimeout` 핸들이 `cleanup()`에 등록되지 않아 데몬 종료 시 콜백이 이미 정리된 리소스에 접근 가능.
- **수정**: `_cleanupResources`에 타이머 추가.

### L-21. `selfWrites` 선언 위치 이동 — 유지보수 리스크
- **위치**: `src/daemon/server.ts:264`
- **분류**: 유지보수
- **설명**: 사용 위치와 250줄 떨어진 곳으로 이동. 기능상 문제 없으나 리팩토링 시 참조 오류 가능성.

### L-22. `watch.ts` — `savedChars` 음수값 미방어
- **위치**: `src/commands/watch.ts:274, 280-281`
- **분류**: 로직 오류 / UX
- **설명**: `origChars - holoChars`가 DB 불일치 시 음수 가능. TUI에 `-500 tok (-12%)` 표시.
- **수정**: `Math.max(0, origChars - holoChars)` 클램핑.

---

## 이전 감사 미수정 CRITICAL/HIGH 항목 상태

| ID | 제목 | 상태 |
|----|------|------|
| C-01 | `/hologram` 경로 탐색 | **미수정** — H-16, H-17에서 동일 패턴 재발 확인 |
| C-02 | `autoHealFile` 경로 탐색 | 미수정 |
| C-03 | validator 동적 로딩 RCE | 미수정 |
| C-04 | `diagnose.ts` knownIds 미초기화 | 미수정 |
| C-05 | `pick()` 빈 배열 크래시 | 미수정 |
| H-01~H-15 | (전체) | 미수정 |

> **경고**: C-01 경로 탐색 패턴이 새 코드(H-16, H-17)에서 반복 발생.
> `assertInsideWorkspace()` 공통 헬퍼 도입을 강력 권장.

---

## 버그 완료 태그

> **`BUG-AUDIT-2026-04-01-inc1`**
