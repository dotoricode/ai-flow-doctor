# S Rank: 면역 성숙도 기반 최고 등급

> Status: 💡 draft
> Created: 2026-04-01

## 배경

현재 Guardian 등급은 A+ (80점)이 최고이며, antibody 3개 + heal 3회면 쉽게 도달한다.
장기 사용자에게 성장 동기가 사라지는 문제가 있다.

## 핵심 아이디어

단순 점수 임계값 추가가 아닌, **면역 성숙 조건(질적 전환)**을 충족해야 S 등급에 도달하는 구조.

## 후보 조건 (논의 필요)

| 조건 | 근거 |
|------|------|
| 다양한 파일 타입 커버 (antibody diversity) | 단일 타입만 보호하면 진정한 면역이 아님 |
| Heal 성공률 95%+ | 양보다 질 — 오탐 없는 정확한 복구 |
| Validator 1개 이상 존재 | Dynamic Immune Synthesis 활성화 증거 |
| 연속 가동 시간 N시간+ | 안정성 증명 |
| Suppression 정확도 | 사용자 의도를 올바르게 판별하는 능력 |

## 등급 체계 (안)

```
S  (조건 충족) → "IMMORTAL"    — 완전한 면역 체계
A+ (80+)      → "FORTIFIED"   — 기존 유지
A  (60-79)    → "GUARDED"     — 기존 유지
B  (40-59)    → "LEARNING"    — 기존 유지
C  (20-39)    → "EXPOSED"     — 기존 유지
D  (0-19)     → "VULNERABLE"  — 기존 유지
```

## 열린 질문

- S 조건은 AND (모두 충족)인가, 포인트 기반 (N개 이상 충족)인가?
- "IMMORTAL" 라벨이 적절한가? 대안: "SOVEREIGN", "APEX", "ABSOLUTE"
- S 달성 시 시각적 피드백은? (CLI 이스터에그, 특별 배너 등)
