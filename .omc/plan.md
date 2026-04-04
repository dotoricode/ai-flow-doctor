# Phase B: Honest Metrics (토큰 추정 엔진)

## 문제
`chars / 4` 고정 비율은 Claude BPE 토크나이저의 실제 동작과 무관한 허구 수치.

## 해결: Content-Aware Heuristic Engine
- 파일 확장자별 경험적 chars/token 비율 적용
- 보수적 추정 (과소 보고 > 과대 보고)
- 신뢰도 레이블: 'heuristic' (향후 실측 기반 'measured' 확장 가능)

## 비율 테이블
| 확장자 | chars/token | 근거 |
|--------|-------------|------|
| ts/js  | 3.2 | 키워드, 심볼, 브레이스 다수 |
| tsx/jsx | 3.0 | XML 태그가 비율 낮춤 |
| py | 3.5 | 영어 식별자 비중 높음 |
| go | 3.3 | 간결한 키워드 |
| rs | 3.1 | 라이프타임, 매크로 |
| json | 2.8 | 구두점, 짧은 키 |
| md | 4.2 | 산문 중심 |
| default | 3.5 | 보수적 폴백 |

## 변경 파일
- `src/core/token-estimator.ts` (신규)
- `src/daemon/server.ts` (import + persistHologramStats)
- `src/daemon/http-routes.ts` (import + /mini-status)
- `src/daemon/types.ts` (persistCtxSavings 타입)

## 상태
- [x] 완료
