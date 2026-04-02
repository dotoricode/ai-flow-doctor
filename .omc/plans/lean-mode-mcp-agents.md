# Lean Mode: afd 개발 최소 MCP·에이전트 구성

**작성일:** 2026-04-02  
**상태:** 계획 (미적용)

---

## 요구사항 요약

afd 개발에 꼭 필요한 MCP 플러그인과 OMC 에이전트만 남기고,  
불필요한 것은 비활성화하여 컨텍스트 오염·토큰 낭비를 줄인다.

## 수용 기준

- [x] 불필요한 OMC MCP 도구가 project settings.json 권한에서 제외됨
- [x] python_repl 등 afd와 무관한 도구가 명시적으로 차단됨 (permissions.deny 추가)
- [x] CLAUDE.md에 "Lean Agent 목록"이 정의됨 (에이전트는 비활성화 불가 — 사용 지침으로 대체)
- [x] afd MCP 도구(afd_read, afd_hologram, afd_diagnose, afd_score)는 계속 허용됨
- [x] 기존 동작(LSP, notepad, state, project_memory)이 유지됨

---

## 분석: 레이어별 처리 방안

### Layer 1 — MCP 플러그인 (global settings.json)

현재 3개 활성화. **변경 없음** — 이미 최소화되어 있음.

| 플러그인 | 상태 | 이유 |
|---|---|---|
| `context7` | ✅ KEEP | Bun / Tree-sitter API 조회 |
| `github` | ✅ KEEP | PR·이슈 관리 |
| `oh-my-claudecode` | ✅ KEEP | OMC 핵심, 비활성화 불가 |
| `codex` | ✅ 이미 비활성화 | 변경 없음 |

### Layer 2 — OMC MCP 도구 (project settings.json 권한 화이트리스트)

현재 `mcp__plugin_oh-my-claudecode_t__*`가 project settings.json에 명시되지 않아 **전체 허용** 상태.  
프로젝트 settings.json에 필요한 도구만 명시적으로 허용한다.

**KEEP (허용 유지):**

| 도구 그룹 | 도구 목록 | 이유 |
|---|---|---|
| LSP | `lsp_diagnostics`, `lsp_diagnostics_directory`, `lsp_goto_definition`, `lsp_find_references`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_hover`, `lsp_rename` | TypeScript 소스 탐색·수정 핵심 |
| Notepad | `notepad_read`, `notepad_write_manual`, `notepad_write_priority`, `notepad_write_working`, `notepad_prune`, `notepad_stats` | 작업 중 메모·컨텍스트 관리 |
| State | `state_write`, `state_read`, `state_get_status`, `state_list_active`, `state_clear` | OMC 워크플로우 상태 (ralplan 등) |
| Project Memory | `project_memory_read`, `project_memory_write`, `project_memory_add_note`, `project_memory_add_directive` | 프로젝트 기억 |
| Trace | `trace_summary`, `trace_timeline` | 데몬 버그 추적 |
| Session | `session_search` | 세션 이력 조회 |

**DISABLE (권한에서 제외):**

| 도구 | 이유 |
|---|---|
| `python_repl` | afd는 TypeScript/Bun 프로젝트. Python 불필요 |
| `ast_grep_search`, `ast_grep_replace` | Grep + LSP로 충분. 중복 |
| `lsp_code_actions`, `lsp_code_action_resolve`, `lsp_prepare_rename`, `lsp_servers` | 저빈도 사용; 필요 시 재활성화 |

### Layer 3 — OMC 에이전트

Claude Code 플러그인 시스템상 개별 에이전트는 비활성화 불가  
(agent type string으로 접근 — 플러그인 전체 on/off만 가능).  
→ **CLAUDE.md에 "afd 승인 에이전트 목록"을 정의하여 사용 지침으로 제어.**

**afd 핵심 에이전트 (7종):**

| 에이전트 | 역할 |
|---|---|
| `oh-my-claudecode:executor` | 구현 작업 실행 |
| `oh-my-claudecode:explore` | 코드베이스 탐색 |
| `oh-my-claudecode:debugger` | 데몬 버그 분석 |
| `oh-my-claudecode:tracer` | 인과 추적·가설 검증 |
| `oh-my-claudecode:architect` | 아키텍처 결정 (S.E.A.M, 면역 설계) |
| `oh-my-claudecode:git-master` | 커밋·브랜치 관리 |
| `oh-my-claudecode:verifier` | 구현 완료 검증 |

**보조 에이전트 (5종, 필요 시 사용):**

| 에이전트 | 용도 |
|---|---|
| `oh-my-claudecode:analyst` | 요구사항 분석 (복잡한 기능 설계 전) |
| `oh-my-claudecode:critic` | 계획·코드 비판적 검토 |
| `oh-my-claudecode:planner` | `/plan` 스킬 내부 전용 |
| `oh-my-claudecode:test-engineer` | 테스트 전략 수립 |
| `oh-my-claudecode:security-reviewer` | 면역 시스템 보안 검토 |

**사용 자제 에이전트 (8종):**  
`designer`, `document-specialist`, `scientist`, `writer`,  
`qa-tester`, `code-reviewer`, `code-simplifier`, `oh-my-claudecode:architect` (plan 외부에서 단독 호출)

---

## 구현 단계

### Step 1 — project settings.json 업데이트 (OMC MCP 화이트리스트)

파일: `D:\00_work\autonomous-flow-daemon\.claude\settings.json`

`permissions.allow` 배열에 다음을 추가 (현재 없는 항목만):

```
"mcp__plugin_oh-my-claudecode_t__lsp_diagnostics",
"mcp__plugin_oh-my-claudecode_t__lsp_diagnostics_directory",
"mcp__plugin_oh-my-claudecode_t__lsp_goto_definition",
"mcp__plugin_oh-my-claudecode_t__lsp_find_references",
"mcp__plugin_oh-my-claudecode_t__lsp_document_symbols",
"mcp__plugin_oh-my-claudecode_t__lsp_workspace_symbols",
"mcp__plugin_oh-my-claudecode_t__lsp_hover",
"mcp__plugin_oh-my-claudecode_t__lsp_rename",
"mcp__plugin_oh-my-claudecode_t__notepad_read",
"mcp__plugin_oh-my-claudecode_t__notepad_write_manual",
"mcp__plugin_oh-my-claudecode_t__notepad_write_priority",
"mcp__plugin_oh-my-claudecode_t__notepad_write_working",
"mcp__plugin_oh-my-claudecode_t__notepad_prune",
"mcp__plugin_oh-my-claudecode_t__notepad_stats",
"mcp__plugin_oh-my-claudecode_t__state_write",
"mcp__plugin_oh-my-claudecode_t__state_read",
"mcp__plugin_oh-my-claudecode_t__state_get_status",
"mcp__plugin_oh-my-claudecode_t__state_list_active",
"mcp__plugin_oh-my-claudecode_t__state_clear",
"mcp__plugin_oh-my-claudecode_t__project_memory_read",
"mcp__plugin_oh-my-claudecode_t__project_memory_write",
"mcp__plugin_oh-my-claudecode_t__project_memory_add_note",
"mcp__plugin_oh-my-claudecode_t__project_memory_add_directive",
"mcp__plugin_oh-my-claudecode_t__trace_summary",
"mcp__plugin_oh-my-claudecode_t__trace_timeline",
"mcp__plugin_oh-my-claudecode_t__session_search",
"mcp__afd__afd_read",
"mcp__afd__afd_hologram",
"mcp__afd__afd_diagnose",
"mcp__afd__afd_score"
```

제외 (명시적 미포함): `python_repl`, `ast_grep_*`, `lsp_code_actions`, `lsp_code_action_resolve`, `lsp_prepare_rename`, `lsp_servers`

> **주의:** Claude Code는 `permissions.allow`에 없는 MCP 도구를 호출 시 사용자 승인을 요구한다.  
> 완전한 차단이 아니라 "자동 허용 안 함" 수준. 진정한 차단은 `permissions.deny` 추가로 가능하나 현재는 불필요.

### Step 2 — CLAUDE.md 업데이트 (Lean Agent 지침 추가)

`## 7. Lean Agent Mode` 섹션을 CLAUDE.md에 추가:
- afd 핵심 에이전트 7종 목록
- "사용 자제" 에이전트 8종 목록
- 이유: 불필요한 에이전트 호출은 토큰 낭비이며 S.E.A.M 사이클 < 270ms 원칙에 위배

---

## 리스크·완화

| 리스크 | 완화 방법 |
|---|---|
| ast_grep 제외 후 AST 분석 불가 | LSP `lsp_document_symbols` + Grep으로 대체 가능 |
| python_repl 제외 후 스크립트 실행 불가 | afd는 순수 Bun 프로젝트; Bash 도구로 충분 |
| 에이전트 "사용 자제" 지침 미준수 | CLAUDE.md에 명시; 에이전트 호출 전 목록 확인 유도 |

---

## 검증 단계

1. `D:\00_work\autonomous-flow-daemon\.claude\settings.json` JSON 유효성 확인
2. Claude Code 재시작 후 `python_repl` 호출 시 승인 프롬프트 발생 확인
3. `afd_read`, `lsp_goto_definition` 등 허용 도구는 자동 승인 확인
4. CLAUDE.md에 섹션 추가 여부 확인
