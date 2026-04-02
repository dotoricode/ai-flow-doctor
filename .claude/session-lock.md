# Session Lock State

> 이 파일은 멀티-세션 협업 시 활성 세션 상태를 추적합니다.
> 각 터미널에서 `export CLAUDE_SESSION_ID=@Session-N` 후 작업하세요.

active_session: @Session-1
last_updated: 2026-04-03

## 등록된 세션

| 세션 ID | 역할 | 시작 시각 | 현재 작업 |
|---|---|---|---|
| @Session-1 | Coordinator | 2026-04-03 | v1.8.0 설계 |
| @Session-2 | Feature Dev | 2026-04-03 | 접속 중 |

## 세션 추가 방법

새 터미널에서:
```bash
export CLAUDE_SESSION_ID=@Session-2
```

그리고 이 파일의 "등록된 세션" 테이블에 행 추가.
| @Session-2 | Feature Dev | 2026-04-03 | 미정 |
