# Specification Quality Checklist: 친구에게 취향이 전달된다 (마일스톤 2)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-28
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

### clarify 세션 후 재검증 (2026-08-28)

`/speckit-clarify` 4문답을 반영한 뒤 다시 돌렸다. **일시적으로 2건이 깨졌다가 복구됐다.**

| 항목 | 무슨 일이 있었나 |
|---|---|
| All acceptance scenarios are defined | Q4로 알림 FR 7건(FR-028~034)이 새로 들어왔는데 **대응 시나리오가 없었다.** US3에 시나리오 4건(5~8)을 더해 해소 |
| All functional requirements have clear acceptance criteria | 위와 같은 원인·같은 조치 |

Q4가 범위를 늘리는 답이었기 때문에 생긴 회귀다. **요구사항만 늘리고 시나리오를 안 늘리면
테스트할 수 없는 FR이 남는다** — clarify가 범위를 키울 때 반드시 같이 확인할 지점이다.

### 검증 중 고친 것

1차 작성본에서 아래를 수정한 뒤 통과했다.

| 문제 | 조치 |
|---|---|
| FR-001이 "32바이트 URL-safe 랜덤 토큰"이라고 구현을 명시 | **"추측할 수 없는"**으로 바꿨다. 바이트 수와 인코딩은 plan 단계의 결정이다 |
| 성공 지표에 "응답 200ms 이내" 류의 기술 지표를 넣으려 함 | 사용자 관점 지표로 대체했다 (SC-001 "3분 안에 친구가 되어 취향을 볼 수 있다") |
| `partial unique index`를 요구사항 본문에 씀 | FR-015를 **"활성 친구 관계는 최대 하나만"**이라는 불변식으로 서술했다. 인덱스는 구현 수단이다 |

### [NEEDS CLARIFICATION] 를 쓰지 않은 이유

이 기능은 `docs/domain-model.md` §4·§7과 화면 명세 §7 SCR-M2에 **이미 결정이 내려져 있다.**
승인 절차 부재(3-3), 항목별 공개 없음(D2), soft delete 후 재추가(D3), 미리보기 노출 범위(§7)가
전부 근거와 함께 확정돼 있어 추측할 자리가 없었다.

대신 **열린 항목 3건**을 스펙 말미에 별도 표로 남겼다. 이것들은 "스펙을 못 쓸 정도의 공백"이
아니라 **구현 착수 전에 닫아야 하는 결정**이라 마커 대신 표로 두는 편이 맞다.

| # | 항목 | 닫을 곳 |
|---|---|---|
| 1 | 대표 태그 선정 규칙 (최신순 3건으로 충분한가) | `/speckit-clarify` |
| 2 | `Notification` 없이 FR-017 알림을 어떻게 전달할지 | `/speckit-plan` |
| 3 | 미리보기 주소 체계 `/i/{token}` 와 로그인 게이트의 관계 | `/speckit-plan` |

> 1번은 도메인 모델 §13-5가 **"M2 착수 시점에 닫는다"**고 명시한 항목이다. 지금이 그 시점이다.

### 범위 경계에서 내린 판단

화면 명세 SCR-M2-01·06이 **`Event`(다가오는 일정)를 M2 화면 안에 그려두었다.** 그런데
도메인 모델 §11은 `Event`를 **M3 구축 대상**으로 분류한다. 두 문서가 어긋난다.

**이 스펙은 도메인 모델을 따라 일정 영역을 M2 범위 밖으로 뒀다.** 근거는 §11의
"순서를 바꾸면 취향이 비어 있는 화면을 시연하게 된다" — 마일스톤 경계가 구축 순서의 근거이기 때문이다.
같은 이유로 `Notification` 화면과 진행 중 거래 예외(D3)도 밀어냈다.

**이 판단은 plan 단계에서 팀이 뒤집을 수 있다.** 뒤집는다면 M2 범위가 `Event`만큼 늘어난다.
