# Team CalTalk 통합 테스트 리포트 (playwright-mcp)

- **실행일**: 2026-07-13
- **참조 문서**: `docs/3-user-scenarios.md` (SC-01~12)
- **테스트 방식**: `docs/6-project-structure.md` §4 방침에 따라 자동화 테스트 스위트 대신 playwright-mcp로 실제 개발 서버(프론트엔드 http://localhost:5173, 백엔드 http://localhost:4000)를 구동해 SC-01~12를 수동 워크스루로 검증. 프론트엔드 UI가 없는 항목은 보조적으로 API(curl)로 백엔드 구현 여부만 확인.
- **테스트 계정**: e2e-kim-20260713@techteam.io(김철수), e2e-lee-20260713@techteam.io(이서연), e2e-park-20260713@techteam.io(박준영) / 비밀번호 공통 `TestPass123!`
- **테스트 팀**: "테크팀" (team id 66)
- **스크린샷**: `test/e2e/screenshots/`

## 1. 요약

| ID | 제목 | 결과 | 비고 |
|---|---|---|---|
| SC-01 | 회원가입/로그인/미인증 접근 차단 | ✅ PASS | 기본 흐름, E1, E2 모두 확인 |
| SC-02 | 팀 생성 및 팀원 추가 | ✅ PASS | 기본 흐름, E1(권한없음), E2(미가입 검색) 모두 확인 |
| SC-03 | 팀장의 팀 일정 생성 | ⚠️ 부분 구현 | 백엔드 로직(201/403)은 동작하나 프론트 UI(일정 생성 폼)가 없어 사용자가 도달 불가 |
| SC-04 | 캘린더 월/주/일 단위 조회 | ❌ NOT IMPLEMENTED | 백엔드 GET 엔드포인트 미구현(404), 프론트 캘린더 컴포넌트 없음 |
| SC-05 | 팀장의 기존 일정 수정/삭제 | ❌ NOT IMPLEMENTED | 백엔드 PATCH/DELETE 엔드포인트 미구현(404) |
| SC-06 | 팀원의 일정 변경 요청 제기 | ❌ NOT IMPLEMENTED | chat/change-request 백엔드 모듈 자체가 없음 |
| SC-07 | 팀장의 변경 요청 승인 | ❌ NOT IMPLEMENTED | change-request 모듈 없음 |
| SC-08 | 팀장의 변경 요청 거절 | ❌ NOT IMPLEMENTED | change-request 모듈 없음 |
| SC-09 | 복수 대기 요청 자동 거절 | ❌ NOT IMPLEMENTED | change-request 모듈 없음 |
| SC-10 | 요청자 본인의 요청 취소 | ❌ NOT IMPLEMENTED | change-request 모듈 없음 |
| SC-11 | 팀장 최소 1인 유지 | ✅ PASS | 거부 2건(역할변경/제외) + 허용 1건(A1) 모두 확인 |
| SC-12 | 채팅 메시지 작성/이력 조회 | ❌ NOT IMPLEMENTED | chat 백엔드 모듈 자체가 없음(404) |

**BR-xx 커버리지**: 이번 실행으로 BR-01, BR-08, BR-09, BR-14, BR-15(SC-01·02·11 경유)가 직접 검증됨. BR-02/03/07(SC-03)은 API 레벨까지만 검증. BR-04~06, BR-10~13은 기능 자체가 아직 없어 검증 불가.

이는 결함이 아니라 `docs/7-execution-plan.md` 기준 Day 1(인증/팀) 완료, Day 2(캘린더) 착수 전 상태를 그대로 반영한다 — FE-13(schedule.api.js, 본 세션 이전 작업)만 구현되었고 FE-14~26(캘린더/채팅 UI), BE-13/14(일정 조회/수정/삭제), BE-16 이후(채팅/변경요청)는 착수 전이다.

---

## 2. SC-01. 회원가입 및 로그인, 미인증 접근 차단 — ✅ PASS

| 단계 | 기대 결과 | 실제 결과 | 근거 |
|---|---|---|---|
| E2: localStorage 초기화 후 `/teams` 직접 접근 | `/login`으로 리다이렉트, 서버는 401 | `/login`으로 리다이렉트됨. `GET /api/teams` (토큰 없음) → `401 UNAUTHORIZED "인증 토큰이 필요합니다"` | `screenshots/sc01-01-unauth-redirect-to-login.png` |
| 기본 흐름 1~2: 회원가입(김철수) | 가입 성공 후 `/login`으로 이동 | 동일하게 동작 | - |
| E1: 로그인 시 잘못된 비밀번호 | 401 + 오류 메시지, 로그인 화면 유지 | "이메일 또는 비밀번호가 일치하지 않습니다" 표시, 화면 유지 | `screenshots/sc01-02-login-wrong-password.png` |
| 기본 흐름 3~4: 올바른 자격증명으로 로그인 | 인증 토큰 발급, `/teams`로 이동 | 동일하게 동작 | - |

BR-01 커버.

---

## 3. SC-02. 팀 생성 및 팀원 추가 — ✅ PASS

| 단계 | 기대 결과 | 실제 결과 | 근거 |
|---|---|---|---|
| 기본 흐름 1~2: "테크팀" 생성 | Team 생성, 생성자 자동 팀장(BR-15) | team id 66 생성, 목록에 "테크팀 — 팀장" 표시 | - |
| 기본 흐름 3~4: 이메일로 이서연 검색 후 즉시 추가(BR-14) | 검색 결과 노출, 추가 시 즉시 팀원으로 등록(초대/수락 절차 없음) | 검색 → "이서연 (email)" 노출 → 추가 클릭 → "이서연님을 팀원으로 추가했습니다", 목록에 즉시 반영 | `screenshots/sc02-02-members-added.png` |
| E2: 미가입 이메일("new.hire-notexist-...") 검색 | "가입된 사용자를 찾을 수 없습니다" 안내, 추가 진행 안 함 | 동일 문구 표시 확인 | `screenshots/sc02-01-search-unregistered-email.png` |
| E1: 팀원(이서연)이 팀원 추가 시도 | 403 Forbidden, TeamMembership 생성 안 됨 | UI: 팀원 로그인 시 검색/추가 폼 자체가 렌더링되지 않음(관리 버튼도 없음). API 직접 호출: `POST /api/teams/66/members` (이서연 토큰) → `403 FORBIDDEN "팀장만 팀원을 추가할 수 있습니다"` | `screenshots/sc02-03-member-no-add-ui.png` |

BR-08(A1, 4절에서 별도 서술), BR-09 전제, BR-14, BR-15 커버.

---

## 4. SC-03. 팀장의 팀 일정 생성 — ⚠️ 부분 구현 (API만)

프론트엔드 `TeamWorkspacePage`가 "캘린더/채팅 통합 화면은 Day 2 이후 구현됩니다" 플레이스홀더뿐이라 UI로는 도달 불가(`screenshots/sc03-12-workspace-placeholder-not-implemented.png`). 백엔드 로직만 API로 보조 검증:

| 요청 | 기대 | 실제 |
|---|---|---|
| 팀장(이서연)이 `POST /api/teams/66/schedules`로 "스프린트 계획 회의" 생성 | 201, Schedule 생성 | `201`, id 33로 생성됨 |
| 팀원(박준영)이 동일 API 호출(E1) | 403 Forbidden | `403 FORBIDDEN "팀장만 일정을 생성할 수 있습니다"` |

BR-02/BR-07은 API 레벨 확인, BR-03(조회전용)은 UI 부재로 미검증. `frontend/src/api/schedule.api.js`(Issue #6/FE-13, 이번 세션 이전 작업)의 경로 규약과 이 응답이 일치함을 재확인.

---

## 5. SC-04/05. 캘린더 조회, 일정 수정/삭제 — ❌ NOT IMPLEMENTED

```
GET /api/teams/66/schedules?view=month&date=2026-07-14  → 404 NOT_FOUND
PATCH/DELETE /api/teams/:teamId/schedules/:scheduleId    → 404 NOT_FOUND (이전 세션에서 확인)
```

`backend/src/modules/team-schedule/schedule.routes.js`에는 `POST /:teamId/schedules`(BE-12) 라우트만 존재하고 BE-13(수정/삭제)·BE-14(조회) 라우트가 없다. 프론트에도 캘린더 컴포넌트(FE-16~18)가 없다. BR-03/BR-16(SC-04), BR-02/03(SC-05) 미검증.

---

## 6. SC-06~10, SC-12. 변경 요청 및 채팅 — ❌ NOT IMPLEMENTED

```
backend/src/modules/  → auth/, team-schedule/  (chat/, change-request/ 없음)

POST /api/teams/66/messages              → 404 NOT_FOUND
GET  /api/teams/66/messages?date=...     → 404 NOT_FOUND
```

`chat`, `change-request` 백엔드 모듈이 아예 생성되지 않은 상태(BE-16 이후 미착수)라 SC-06(BR-04/10), SC-07(BR-05/13), SC-08(BR-05/13/16), SC-09(BR-11/13), SC-10(BR-12), SC-12(BR-01/06/16) 전부 실행 불가. 프론트 채팅 UI(FE-22~29)도 없다.

---

## 7. SC-11. 팀장이 1명뿐인 팀에서 제외/역할변경 시도 거부 — ✅ PASS

| 단계 | 기대 결과 | 실제 결과 | 근거 |
|---|---|---|---|
| 유일 팀장(김철수) 본인을 "팀원으로 변경" 시도 | 거부, "팀에는 최소 1명의 팀장이 있어야 합니다" | 동일하게 거부, 역할은 팀장으로 유지 | `screenshots/sc11-01-sole-leader-role-change-rejected.png` |
| 유일 팀장(김철수) 본인을 "제외" 시도 | 동일 사유로 거부 | 거부됨, 목록에서 사라지지 않음 | `screenshots/sc11-02-sole-leader-remove-rejected.png` |
| A1: 이서연을 팀장으로 승격(팀장 2명) 후 김철수를 팀원으로 변경 | 허용 | 성공적으로 팀원으로 전환됨. 즉시 관리 버튼(UI) 사라짐(권한 없어짐) | `screenshots/sc11-03-two-leaders-demote-allowed.png` |

BR-09 커버 (기본 흐름 + A1 모두).

---

## 8. 발견 사항

- 결함 없음. 구현된 범위(인증, 팀/팀원 관리, 일정 생성 API) 내에서는 `docs/3-user-scenarios.md`의 기대 동작과 100% 일치.
- 프론트엔드 클라이언트 검증은 UX 보조일 뿐이고(`ProtectedRoute.jsx`, `AuthContext.jsx` 주석에도 명시) 실제 신뢰 경계는 서버 401/403이라는 CLAUDE.md 원칙이 코드에 일관되게 반영되어 있음을 확인.
- 캘린더/채팅/변경요청(SC-03 UI, SC-04~10, SC-12)은 Day 2~4 범위로 아직 개발 전이며, 이번 리포트의 "NOT IMPLEMENTED"는 결함이 아니라 진행 상황 스냅샷이다.
