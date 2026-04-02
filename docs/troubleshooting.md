# afd Troubleshooting Log

이 파일은 `afd` 개발 중 발생한 오류와 해결책을 누적 기록합니다.

---

## [2026-04-02] Cannot find package 'web-tree-sitter'

**증상**
```
afd start
error: Cannot find package 'web-tree-sitter' from 'D:\...\src\core\hologram\engine.ts'
```

**원인**
`package.json`의 `dependencies`에 `web-tree-sitter@^0.26.8`이 선언되어 있으나,
`node_modules`에 실제로 설치되지 않은 상태였음. `bun install` 없이 실행 시도 시 발생.

**해결**
```bash
bun install
```
`web-tree-sitter`, `tree-sitter-python`, `tree-sitter-typescript` 3개 패키지가 설치되며 해결.

**재발 방지**
- `git clone` 또는 `git pull` 후 항상 `bun install` 먼저 실행
- CI/CD 파이프라인에 `bun install` 스텝 포함 확인

---
