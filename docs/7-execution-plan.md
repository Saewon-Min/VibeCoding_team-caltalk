# Team CalTalk 실행 계획 (DB / Backend / Frontend)

## 0. 개요

**근거 문서**: `1-domain-definition.md`(v1.2), `2-PRD.md`(v1.1), `3-user-scenarios.md`(v1.1), `5-arch-diagram.md`, `6-project-structure.md`

**전제 조건 (모든 Task 공통)**
- 1인 개발, 5일 내 핵심 기능 완성이 목표인 MVP. 이번 계획은 **기능적 정확성 검증**까지만 다루며, 3,000팀 동시 사용 등 확장성/성능 튜닝은 범위 밖이다.
- 기술 스택 고정: React / Node.js+Express / PostgreSQL / REST API. 캐시, 메시지 브로커, 별도 인증 서버, GraphQL, 네이티브 모바일 등은 도입하지 않는다.
- 실시간 갱신 방식(폴링 vs WebSocket)은 PRD상 미확정이며, 가장 단순한 폴링을 우선 채택한다(BE-17).
- Task ID 체계: DB-xx(데이터베이스) / BE-xx(백엔드) / FE-xx(프론트엔드). 각 Task는 완료 조건과 의존성을 체크박스로 명시한다.

**진행 방식**: DB → Backend → Frontend 순으로 완전히 순차 진행하는 것이 아니라, 같은 Day 내에서 DB 스키마가 먼저 확정되면 Backend와 Frontend가 API 계약(REST 엔드포인트/요청·응답 형태)을 기준으로 병행 가능하다. 단, Frontend의 각 Task는 대응하는 Backend API의 "완료"가 아니라 "요청/응답 계약 확정"만으로도 목업 데이터 기반 병행 착수가 가능함을 참고한다.

---

## 1. 서브에이전트 산출물 교차 검토 — 발견된 충돌과 해소

3개 영역(DB/Backend/Frontend)을 독립된 전문 서브에이전트가 병렬로 설계하는 과정에서 아래 2건의 불일치가 발견되어 다음과 같이 해소했다.

### 1.1 충돌: 동일 비즈니스 규칙의 이중 구현 (DB 트리거 vs Service 계층)

DB 서브에이전트는 BR-06(메시지 불변성), BR-09(팀장 최소 1인), BR-11(동일 일정 복수 대기 요청 자동 거절), BR-12(상태 전이 제약), BR-13(시스템 메시지 자동 생성) 5개 규칙을 PostgreSQL 트리거로 구현하는 Task(원 DB-06, DB-14, DB-16, DB-17, DB-18)를 제안했다. 동시에 Backend 서브에이전트는 동일한 5개 규칙을 Service 계층 로직(BE-10/11, BE-16, BE-20~22, BE-24)으로 이미 구현하도록 계획했다.

**결정: Service 계층 단일 소유로 통일하고, 위 5개 DB 트리거 Task는 채택하지 않는다.**

**근거**
- `6-project-structure.md`가 이미 확립한 계층 원칙상 Query 계층은 순수 SQL 데이터 접근만 담당하고, 상태 기반 검증/워크플로 로직은 Service 계층 책임이다. DB 트리거는 이 원칙에 없는 새로운 실행 경로를 추가하는 것이다.
- 동일 규칙을 두 곳(SQL 트리거 + JS Service)에 구현하면 1인 개발자가 두 언어·두 실행 위치에서 같은 버그를 두 번 디버깅해야 하는 비용이 5일 MVP 범위에 비해 과도하다.
- Service 계층 구현만으로도 `messages`, `schedule_change_requests`의 정합성 유지 조건(BR-06/09/11/12/13)을 API 경계에서 100% 강제할 수 있다 — 이 프로젝트에는 API를 우회해 DB에 직접 쓰는 별도 클라이언트가 없다.

DB 영역은 **구조적으로 항상 참이어야 하는 무결성 규칙**(FK, UNIQUE, CHECK — 예: `end_time > start_time`, `message_type`-`author_id` 조합, 이메일 유일성)만 담당한다. 이 결정에 따라 DB-06, DB-14, DB-16, DB-17, DB-18은 **채택하지 않음**으로 표시하고, 해당 규칙의 소유권을 명시적으로 Backend Task에 남긴다 (§2 Day 1/3/4의 DB 섹션 참조).

### 1.2 누락: "내 소속 팀 목록 조회" API

Frontend 서브에이전트가 `FE-08`(team.api.js) 작성 중, `TeamListPage`(FE-10)가 필요로 하는 "로그인 사용자의 소속 팀 목록 조회" 엔드포인트가 Backend 계획에 명시적으로 없다는 점을 발견하고 확인이 필요하다고 표시했다.

**결정**: `BE-08`(팀 생성)에 `GET /api/teams`(내 소속 팀 목록 + 각 팀에서의 역할 반환)를 완료 조건으로 추가한다. 별도 Task를 신설하지 않고 기존 BE-08에 편입한다 (§2 Day 1 참조).

---

## 2. Day별 실행 계획

### Day 1 — 인증 + DB 스키마 + 팀 관리

#### DB 트랙

**DB-01. PostgreSQL 연결 풀 및 환경설정**
- [x] `backend/src/db/pool.js`가 `pg.Pool`을 생성하고 `.env`의 DB 접속정보로 초기화된다.
- [x] `backend/.env.example`에 `DB_HOST/PORT/NAME/USER/PASSWORD`가 값 없이 포함된다.
- [x] 앱 기동 시 헬스체크 쿼리로 연결 성공 여부가 로그로 확인된다.
- [x] `.env`는 `.gitignore`에 포함된다.
- 의존성: [x] 없음(최초 작업)

**DB-02. 마이그레이션 실행 체계 구축**
- [ ] `backend/src/db/migrations/`에 순번 기반 파일 네이밍 규칙이 문서화되어 있다.
- [x] `npm run migrate`(up) / `npm run migrate:undo`(최소 1단계 롤백) 스크립트가 존재한다.
- [ ] 빈 DB에서 `npm run migrate` 1회 실행으로 전체 스키마가 오류 없이 생성된다.
- 의존성: [x] DB-01

**DB-03. users 테이블 (ENT-01)**
- [x] `email UNIQUE NOT NULL`, `password_hash NOT NULL` (평문 비밀번호 컬럼 없음).
- [x] 중복 이메일 INSERT 시 `unique_violation` 발생을 확인한다.
- 의존성: [ ] DB-02 · 근거: ENT-01, BR-01, BR-14

**DB-04. teams 테이블 (ENT-02)**
- [x] `created_by`가 `users.id` FK로 설정되어 팀 생성자를 식별한다(BR-15 지원).
- [x] 존재하지 않는 `user_id`로 INSERT 시 FK 위반을 확인한다.
- 의존성: [x] DB-03 · 근거: ENT-02, BR-15

**DB-05. team_memberships 테이블 (ENT-03, BR-08)**
- [x] `UNIQUE(team_id, user_id)` — 동일 팀 중복 소속 차단.
- [x] `role CHECK IN ('leader','member')`.
- [x] `user_id` 단독 유니크는 없음 — 한 사용자가 여러 팀에 다른 역할로 소속 가능함을 스키마로 확인(BR-08).
- 의존성: [x] DB-04 · 근거: ENT-03, BR-08, BR-14

**DB-06. ~~BR-09 트리거~~ → 채택하지 않음**
- 사유: §1.1. BR-09(팀장 최소 1인 유지)는 **BE-10**(Service 계층) + **BE-11**(단위 테스트)이 단독 소유한다.

**DB-07. schedules 테이블 (ENT-04, BR-07)**
- [x] `team_id NOT NULL FK` — 다대다 연결 테이블 없이 단일 FK로 팀 귀속 보장(BR-07).
- [x] `CHECK (end_time > start_time)`.
- [x] `end_time <= start_time` INSERT 시 `check_violation` 확인.
- [x] 역할 기반 쓰기 권한(BR-02)은 이 테이블 책임이 아니라 Service 계층(BE-12) 책임임을 주석으로 명시.
- 의존성: [x] DB-04 · 근거: ENT-04, BR-02(Service 책임 명시), BR-07

**DB-08. schedule_participants 테이블 (ENT-05)**
- [x] `UNIQUE(schedule_id, user_id)`.
- [x] `schedule_id ON DELETE CASCADE` — 일정 삭제 시 참여자 레코드 함께 삭제(SC-05).
- 의존성: [x] DB-07 · 근거: ENT-05, SC-03, SC-05

**DB-09. messages 테이블 (ENT-06)**
- [x] `message_type CHECK IN ('general','change_request','system')`.
- [x] `CHECK ((message_type='system' AND author_id IS NULL) OR (message_type<>'system' AND author_id IS NOT NULL))` — 시스템 메시지만 작성자 없음을 DB 레벨로 강제.
- [x] `team_id NOT NULL FK` — 모든 메시지가 팀에 귀속(BR-16 전제).
- 의존성: [x] DB-04 · 근거: ENT-06, BR-06(데이터 형태만), BR-16

**DB-10. schedule_change_requests 테이블 (ENT-07)**
- [x] `message_id NOT NULL UNIQUE FK → messages.id` — 모든 변경요청이 정확히 1개의 채팅 메시지와 1:1 연결(BR-04 구조적 전제).
- [x] `status CHECK IN ('pending','approved','rejected','cancelled') DEFAULT 'pending'`.
- [x] `processor_id`, `processed_at`은 nullable.
- 의존성: [x] DB-07, DB-09 · 근거: ENT-07, BR-04, BR-05

**DB-11. 인덱스 설계**
- [x] `idx_team_memberships_user_id`, `idx_schedules_team_id_start_time`, `idx_schedule_participants_schedule_id`, `idx_schedule_participants_user_id`, `idx_messages_team_id_created_at`, `idx_change_requests_schedule_id_status`.
- [ ] `EXPLAIN`으로 각 인덱스가 대응 쿼리에서 Index Scan으로 선택됨을 확인.
- 의존성: [x] DB-05, DB-07, DB-08, DB-09, DB-10 · 근거: BR-03, BR-06, BR-11, BR-16

**DB-12. 시드 데이터 스크립트**
- [x] `npm run seed`로 `3-user-scenarios.md` 1.4절의 테크팀/디자인팀, 김철수/이서연/박준영/최유진/정다은, 일정 예시 1~4가 재현된다.
- [x] 비밀번호는 DB-03과 동일한 해시 방식으로 저장된다.
- [x] 재실행해도 중복 키 오류가 없다(`ON CONFLICT DO NOTHING` 등).
- 의존성: [x] DB-03, DB-04, DB-05, DB-07, DB-08 · 근거: SC-01~SC-12(Day5 QA용)

#### Backend 트랙

**BE-01. 프로젝트 스캐폴딩**
- [x] `backend/src/modules/{auth,team-schedule,chat,change-request}`, `middleware/`, `db/`, `shared/` 디렉토리 생성.
- [x] `npm run dev`로 서버 기동, `GET /health` 200 응답.
- [x] ESLint + Prettier 설정, `npm run lint` 동작.
- 의존성: [x] 없음

**BE-03. 인증 미들웨어 (BR-01)**
- [x] 인증 토큰 없이 보호된 라우트 호출 시 401, 데이터 미포함(SC-01 E2).
- [x] 유효 토큰이면 `req.user` 채운 뒤 `next()`.
- [x] 만료/위조 토큰도 401.
- 의존성: [x] BE-01

**BE-04. 팀 경계 접근 제어 미들웨어 (BR-16)**
- [x] `:teamId` 비소속 사용자는 403, 데이터 미포함(SC-04/08/12 E1).
- [x] 소속 사용자는 `req.teamMembership`(역할 포함) 채운 뒤 `next()`.
- [x] `scheduleId` 등 teamId가 URL에 없는 리소스도 소속 팀 조회 기반으로 검증하는 재사용 가능한 헬퍼 제공.
- 의존성: [x] DB-05, BE-03 · 근거: BR-16, SC-04/08/12

**BE-05. 공통 에러 핸들러 및 로깅**
- [x] 모든 예외가 공통 에러 핸들러로 일관된 JSON 형식 응답.
- [x] 401/403/404/409/500 상태 코드가 커스텀 에러 클래스로 매핑.
- [x] 처리되지 않은 예외로 서버가 크래시되지 않음.
- 의존성: [x] BE-01

**BE-06. auth: 회원가입 (BR-01)**
- [x] 정상 입력 시 201, 비밀번호는 해시로 저장(DB 직접 확인).
- [x] 이메일 형식 오류 400, 중복 이메일 409.
- [x] 응답 바디에 비밀번호(해시 포함) 미노출.
- 의존성: [x] DB-03, BE-05 · 근거: BR-01, SC-01

**BE-07. auth: 로그인 (BR-01)**
- [x] 올바른 자격 증명 시 200 + 인증 토큰 발급.
- [x] 잘못된 비밀번호/미존재 이메일 모두 401(존재 여부 비노출)(SC-01 E1).
- [x] 발급 토큰으로 BE-03 통과 확인.
- 의존성: [x] BE-06, BE-03 · 근거: SC-01(E1)

**BE-08. team-schedule: 팀 생성 + 내 소속 팀 목록 조회 (BR-15)**
- [x] 팀 이름 입력 시 201, `teams` 생성과 동시에 생성자가 `team_memberships`(role=leader)로 트랜잭션 내 즉시 등록(SC-02 2단계, BR-15).
- [x] **`GET /api/teams`** — 로그인 사용자의 소속 팀 목록과 각 팀에서의 역할을 반환한다 (§1.2에서 편입된 요구사항, FE-08/FE-10 전제 조건).
- [x] 생성 직후 팀 목록/상세 조회 시 생성자가 팀장 역할로 확인됨.
- 의존성: [x] DB-04, DB-05, BE-03 · 근거: BR-15, SC-02

**BE-09. team-schedule: 팀원 검색 및 즉시 추가 (BR-14)**
- [x] 팀장이 가입 이메일 검색 시 결과 반환, 추가 요청 시 201 + `team_memberships`(role=member) 즉시 생성(SC-02 3~4단계).
- [x] 팀원이 호출 시 403, 미생성(SC-02 E1).
- [x] 미가입 이메일 검색/추가 시 404/400 "가입된 사용자를 찾을 수 없습니다"(SC-02 E2, BR-14).
- [x] 중복 소속 추가 시도 시 409.
- [x] `GET /api/teams/:teamId/members`로 역할 포함 목록 조회 가능.
- 의존성: [x] BE-08, BE-04 · 근거: BR-14, SC-02

**BE-10. team-schedule: 역할변경/제외 — 팀장 최소 1인 유지 (BR-09)** *(DB-06을 대체하는 단독 소유 Task)*
- [x] 팀장 2명 이상 팀에서 1명 변경/제외 시 정상 처리(SC-11 A1).
- [x] 팀장 1명뿐인 팀에서 그 팀장 변경/제외 시도 시 400/409 "팀에는 최소 1명의 팀장이 있어야 합니다", 변경 안 됨(SC-11).
- [x] 팀장 본인만 호출 가능, 팀원 호출 시 403.
- 의존성: [x] BE-08, BE-09 · 근거: BR-09, SC-11

**BE-11. BR-09 단위 테스트**
- [x] 팀장 1명 상태에서 변경/제외 시도 시 서비스 함수가 실패를 반환하는 테스트 통과.
- [x] 팀장 2명 이상 상태에서는 정상 처리 테스트 통과.
- 의존성: [x] BE-10 · 근거: `6-project-structure.md` 자동화 우선순위, BR-09

#### Frontend 트랙

**FE-01. 프로젝트 스캐폴딩 및 라우팅**
- [ ] `npm run dev`로 기동, `/login /signup /teams /teams/:teamId/members /teams/:teamId` 라우트 정의.
- [ ] ESLint + Prettier 설정.
- 의존성: [ ] 없음

**FE-02. API Client 공통 모듈**
- [ ] `.env`의 API base URL로 모든 `*.api.js`가 공용 인스턴스를 통해 호출.
- [ ] 인증 토큰 자동 첨부.
- [ ] 401 응답이 공통 에러 객체로 정규화되어 AuthContext에서 로그아웃 처리에 활용 가능.
- 의존성: [ ] FE-01, [ ] BE-05(에러 응답 포맷 확정)

**FE-03. auth.api.js**
- [ ] `signup()`, `login()`이 각각 대응 엔드포인트 호출, 로그인 성공 시 토큰 추출.
- 의존성: [ ] FE-02, [ ] BE-06, BE-07

**FE-04. AuthContext**
- [ ] 로그인 상태/사용자 정보가 새로고침 후에도 유지.
- [ ] 로그아웃 시 토큰 제거 및 접근 재차단.
- [ ] `useAuth()` 훅 제공.
- 의존성: [ ] FE-01, FE-03

**FE-05. ProtectedRoute**
- [ ] 미인증 상태로 `/teams` 이하 접근 시 데이터 미노출, `/login` 리다이렉트(SC-01 E2).
- [ ] 서버 401이 최종 신뢰 기준이며 본 Task는 UX 보조임을 주석 명시.
- 의존성: [ ] FE-04 · 근거: BR-01, SC-01(E2)

**FE-06. LoginPage / SignupPage**
- [ ] 회원가입 성공 시 로그인 화면 이동.
- [ ] 로그인 성공 시 `/teams` 이동.
- [ ] 자격 증명 오류 시 오류 문구 노출, 화면 유지(SC-01 E1).
- 의존성: [ ] FE-03, FE-04, FE-07

**FE-07. common/ 공통 UI 컴포넌트**
- [ ] Button/Modal/TextInput/FormField 4종 이상, 스토리북 등 별도 문서화 없음.
- 의존성: [ ] FE-01

**FE-08. team.api.js**
- [ ] `createTeam`, `getMyTeams`(BE-08의 `GET /api/teams`), `searchMemberByEmail`, `addMember`, `updateMemberRole`, `removeMember`.
- 의존성: [ ] FE-02, [ ] BE-08, BE-09, BE-10 (§1.2 반영으로 `getMyTeams` 불확실성 해소됨)

**FE-09. TeamContext**
- [ ] 팀 전환 시 `currentTeam`/`currentRole` 갱신 및 하위 컴포넌트 리렌더.
- [ ] 동일 사용자가 팀마다 다른 역할을 가질 때 정확히 반영(SC-02 A1, BR-08).
- 의존성: [ ] FE-04, FE-08

**FE-10. TeamListPage**
- [ ] 소속 팀 목록과 역할 표시.
- [ ] 팀 생성 즉시 본인이 팀장으로 목록에 추가(BR-15, SC-02).
- 의존성: [ ] FE-08, FE-09, FE-07

**FE-11. 팀 생성 폼 + 팀원 검색/추가 UI**
- [ ] 이메일 검색 → 즉시 추가(초대 발송/수락 UI 없음, BR-14).
- [ ] 미가입 이메일 시 안내 문구(SC-02 E2).
- [ ] 팀원 계정에는 팀원 추가 UI 비노출(SC-02 E1).
- 의존성: [ ] FE-08, FE-09, FE-07

**FE-12. TeamMembersPage**
- [ ] 팀장 계정에서만 "역할 변경"/"제외" 버튼 노출.
- [ ] 팀장 1명뿐인 상태에서 서버 오류 메시지 그대로 노출, 상태 불변(SC-11).
- [ ] 팀장 2명 이상이면 정상 반영(SC-11 A1).
- 의존성: [ ] FE-08, FE-09, FE-07, [ ] BE-10

---

### Day 2 — 캘린더 / 일정 CRUD

#### DB 트랙

**DB-13. schedules 조회 성능 검증**
- [ ] 월간 범위 조회 쿼리에 `idx_schedules_team_id_start_time`이 사용됨을 `EXPLAIN`으로 확인.
- [x] 월 경계를 넘는 일정이 조회 결과에서 누락되지 않는지 `start_time`/`end_time` 조건으로 검증.
- 의존성: [ ] DB-07, DB-11 · 근거: BR-03

#### Backend 트랙

**BE-12. team-schedule: 일정 생성 (BR-02, BR-07, ENT-05)**
- [x] 팀장이 제목/시간/참여자 입력 시 201, `schedules`+`schedule_participants` 트랜잭션 생성(SC-03).
- [x] 팀원 호출 시 403, 미생성(SC-03 E1).
- [x] `team_id`는 요청 팀으로 고정(BR-07).
- [x] 참여자가 팀 비소속이면 400.
- 의존성: [x] BE-04, BE-08, BE-09 · 근거: BR-02, BR-07, SC-03

**BE-13. team-schedule: 일정 수정/삭제 (BR-02, BR-03)**
- [x] 팀장이 수정 시 200 + 갱신, 삭제 시 204 + 참여자 레코드 함께 삭제(SC-05).
- [x] 팀원 호출 시 403(SC-05 E1).
- [x] 비소속 팀 scheduleId는 403/404(BR-16).
- [x] `schedule.service.js`가 `updateScheduleFields()`를 change-request 모듈이 재사용 가능하도록 공개.
- 의존성: [x] BE-12, BE-04 · 근거: BR-02, BR-03, SC-05

**BE-14. team-schedule: 월/주/일 조회 (BR-03, BR-16)**
- [x] view=month/week/day 각각 200 응답(SC-04).
- [x] 팀원도 200이나 `canEdit=false` 필드 포함(BR-03).
- [x] 비소속 팀은 403, 데이터 미포함(SC-04 E1, BR-16).
- 의존성: [x] BE-04, BE-12 · 근거: BR-03, BR-16, SC-04

**BE-15. BR-16 접근제어 단위 테스트**
- [x] 비소속 사용자 조회 403, 소속 사용자는 정상 데이터 반환 테스트.
- [x] scheduleId 등 teamId 미포함 리소스도 소속 검증 동작 테스트.
- 의존성: [x] BE-04, BE-14 · 근거: BR-16

#### Frontend 트랙

**FE-13. schedule.api.js**
- [x] `getSchedules`, `createSchedule`, `updateSchedule`, `deleteSchedule` 4개 함수.
- [x] 403 응답을 호출부가 구분 가능한 형태로 반환.
- 의존성: [ ] FE-02, [ ] BE-12, BE-13, BE-14

**FE-14. utils/ 날짜 포맷팅 유틸**
- [x] 월 전체 그리드, 주 7일, 일 단위 계산 함수가 분리되어 재사용됨.
- 의존성: [ ] FE-01

**FE-15. useTeamSchedules 훅**
- [x] 뷰/날짜 전환 시 자동 재요청.
- [x] 로딩/에러 상태 노출.
- 의존성: [ ] FE-13, FE-09

**FE-16~18. CalendarMonthView / WeekView / DayView**
- [x] 월간: 날짜별 일정 표시, 클릭 시 상세 연결(SC-04).
- [x] 주간: 시간대별 타임라인 표시(SC-04).
- [x] 일간: 시간 단위 표시(SC-04).
- 의존성: [ ] FE-14, FE-15, FE-07

**FE-19. ScheduleFormModal (팀장 전용)**
- [x] 제목/설명/시간/참여자 다중 선택 필드(ENT-05, SC-03).
- [x] 생성/수정 시 대응 API 호출.
- [ ] 팀원 계정에는 "일정 추가/수정" 버튼 비노출(SC-03 E1).
- [x] 저장 성공 시 캘린더 즉시 갱신(SC-05).
- 의존성: [ ] FE-13, FE-09, FE-07

**FE-20. 일정 상세보기 + 삭제 확인 모달**
- [x] 팀원 계정은 읽기 전용, 수정/삭제 버튼 비노출(BR-03).
- [x] 팀장 계정만 수정/삭제, 삭제는 확인 모달 경유(SC-05).
- 의존성: [ ] FE-19, FE-13, FE-09, FE-07

**FE-21. TeamWorkspacePage 뼈대**
- [x] 월/주/일 탭 전환.
- [x] 뷰/날짜 상태 유지.
- 의존성: [ ] FE-16, FE-17, FE-18, FE-09

---

### Day 3 — 채팅

#### DB 트랙

**DB-15. messages 일자별 이력 조회 성능 검증**
- [ ] `WHERE team_id=? AND created_at 범위` 쿼리가 `idx_messages_team_id_created_at` 사용 확인.
- [x] 시드 데이터 기준 일반/변경요청/시스템 메시지가 작성일시 순 정렬 확인(SC-12).
- 의존성: [ ] DB-09, DB-11, DB-12 · 근거: SC-12

**DB-14. ~~BR-06 불변성 트리거~~ → 채택하지 않음**
- 사유: §1.1. BR-06(메시지 불변성)은 **BE-16**에서 수정/삭제 API 엔드포인트를 아예 구현하지 않는 방식으로 단독 소유한다 — 존재하지 않는 코드 경로에 대한 DB 트리거는 불필요한 방어 계층이다.

#### Backend 트랙

**BE-16. chat: 메시지 작성 (BR-01, BR-06)** *(DB-14를 대체하는 단독 소유 Task)*
- [x] 소속 팀원 전송 시 201, `messages`(type=general) 생성(SC-12).
- [x] 미인증 401, 비소속 팀 403.
- [x] 빈 본문 400.
- [x] **메시지 수정/삭제 엔드포인트가 존재하지 않음**을 라우트 목록으로 확인(BR-06).
- [x] `message.service.js`가 `createSystemMessage()`를 다른 모듈에 공개.
- 의존성: [ ] DB-02, BE-03, BE-04 · 근거: BR-01, BR-06, SC-12

**BE-17. chat: 일자별 이력 조회 + 폴링 지원 (BR-06, BR-16)**
- [x] date 파라미터로 일자별 메시지가 작성일시 순 반환(SC-12).
- [x] `since` 파라미터로 신규 메시지만 재조회하는 폴링 지원(WebSocket 미도입).
- [x] 비소속 팀 403(SC-12 E1).
- [x] 과거 일자 조회도 동일 동작(BR-06).
- 의존성: [x] BE-16, BE-04 · 근거: BR-06, BR-16, SC-12, PRD 9장

#### Frontend 트랙

**FE-22. message.api.js**
- [x] `getMessagesByDate`, `postMessage`.
- 의존성: [ ] FE-02, [ ] BE-16, BE-17

**FE-23. useChatHistory 훅**
- [ ] 날짜 변경 시 해당 일자 메시지 재조회(SC-12).
- [ ] 과거 날짜 재조회해도 동일 결과(BR-06).
- 의존성: [ ] FE-22, FE-09

**FE-24. ChatHistory / ChatMessageItem**
- [ ] 일반/변경요청/시스템 메시지가 유형별로 구분 렌더링.
- [ ] 수정/삭제 UI 요소 없음(BR-06).
- 의존성: [ ] FE-23, FE-07

**FE-25. ChatInput**
- [ ] 전송 시 `postMessage` 호출, 입력창 초기화, 이력 즉시 반영(SC-12).
- [ ] 빈 메시지 미전송.
- 의존성: [ ] FE-22, FE-23, FE-07

**FE-26. TeamWorkspacePage 캘린더+채팅 통합**
- [ ] 캘린더 일자 선택 시 채팅 패널이 해당 일자로 자동 전환.
- [ ] 데스크톱에서 2단 동시 열람 레이아웃.
- 의존성: [ ] FE-21, FE-24, FE-25

---

### Day 4 — 변경요청 플로우

#### DB 트랙

이 Day에는 신규 DB Task가 없다. 원안의 DB-16(BR-11 트리거), DB-17(BR-12 트리거), DB-18(BR-13 트리거)은 §1.1 결정에 따라 **채택하지 않음** — 각각 **BE-20**(BR-11), **BE-22**(BR-12), **BE-20/21**(BR-13)이 Service 계층에서 단독 소유한다.

#### Backend 트랙

**BE-18. change-request: 변경 요청 제기 (BR-04, BR-10)**
- [x] 참여자인 팀원이 요청 시 201, `schedule_change_requests`(pending)+`messages`(change_request) 생성(SC-06).
- [x] 비참여자 요청 시 400/403, 미생성(SC-06 E1, BR-10).
- [x] 비소속 팀 scheduleId는 403/404(BR-16).
- 의존성: [x] BE-12, BE-16, BE-04 · 근거: BR-04, BR-10, SC-06

**BE-19. change-request: 목록/상세 조회**
- [x] 팀/일정 단위 요청 목록(상태 포함) 조회 가능.
- [x] 상태별 필터링 지원.
- [x] 비소속 팀 403(BR-16).
- 의존성: [x] BE-18 · 근거: SC-07/08/09 전제조건

**BE-20. change-request: 승인 처리 (BR-05, BR-11, BR-13)** *(DB-16, DB-18 일부를 대체하는 단독 소유 Task)*
- [x] 팀장 승인 시 200, 상태 approved, 제안 값이 Schedule에 반영(SC-07).
- [x] 동일 Schedule의 다른 대기 요청이 모두 자동 rejected 전환(SC-09, BR-11).
- [x] 승인/자동거절 각각에 시스템 메시지 생성(SC-07, SC-09, BR-13).
- [x] 팀원 호출 403(SC-07 E1).
- [x] 이미 처리된 요청 재승인 시 409(SC-07 E2, SC-09 E1).
- [x] 전체가 단일 DB 트랜잭션으로 원자적 처리.
- 의존성: [x] BE-18, BE-19, BE-13(`updateScheduleFields()`), BE-16/17(`createSystemMessage()`) · 근거: BR-05, BR-11, BR-13, SC-07, SC-09

**BE-21. change-request: 거절 처리 (BR-05, BR-13)** *(DB-18 일부를 대체하는 단독 소유 Task)*
- [x] 팀장 거절 시 200, 상태 rejected, Schedule 불변(SC-08).
- [x] 거절 시스템 메시지 생성(BR-13).
- [x] 타 팀 팀장 거절 시도 403(SC-08 E1).
- [x] 재거절 시도 409.
- 의존성: [x] BE-18, BE-19, BE-04, BE-16/17 · 근거: BR-05, BR-13, SC-08

**BE-22. change-request: 요청 취소 (BR-12)** *(DB-17을 대체하는 단독 소유 Task)*
- [x] 요청자 본인이 대기 상태 취소 시 200, 상태 cancelled(SC-10).
- [x] 취소 시스템 메시지 생성, 팀장 처리 목록에서 제외(SC-10).
- [x] 이미 처리된 요청 취소 시도 409(SC-10 E1, BR-12).
- [x] 본인 아닌 사용자 취소 시도 403(SC-10 E2).
- 의존성: [x] BE-18, BE-19 · 근거: BR-12, SC-10

**BE-23. 모듈 간 서비스 연동 배선**
- [x] `change-request.service.js`가 `schedule.queries.js`/`message.queries.js`를 직접 호출하지 않고 각 모듈 Service의 공개 함수만 호출(코드 리뷰 확인).
- [x] BE-20 처리 시 실제로 team-schedule/chat Service 경유 동작을 통합 테스트로 확인.
- 의존성: [x] BE-13, BE-17, BE-20, BE-21 · 근거: `5-arch-diagram.md`, `6-project-structure.md`

**BE-24. BR-11/BR-12 동시성 단위 테스트**
- [x] 대기 요청 A 승인 시 B가 자동 rejected 전환 테스트(BR-11, SC-09 A1 포함).
- [x] 이미 거절된 요청 재승인 시 409/예외 테스트.
- [x] 비대기 상태 취소, 타인 취소 시도가 거부되는 테스트(BR-12).
- 의존성: [x] BE-20, BE-22 · 근거: BR-11, BR-12

#### Frontend 트랙

**FE-27. change-request.api.js**
- [ ] `createChangeRequest`, `approveChangeRequest`, `rejectChangeRequest`, `cancelChangeRequest`.
- [ ] 409 응답을 구분 가능한 형태로 반환.
- 의존성: [ ] FE-02, [ ] BE-18, BE-20, BE-21, BE-22

**FE-28. ChangeRequestForm**
- [ ] 자신이 참여자인 일정에 한해 변경 요청 유형 선택 가능(SC-06, BR-10).
- [ ] 제안 제목/시간(선택)/사유 필드(ENT-07).
- [ ] 제출 성공 시 "대기중" 메시지 즉시 노출(SC-06).
- [ ] BR-10 위반 서버 거부 시 오류 노출(SC-06 E1).
- [ ] 팀장 계정에는 미노출.
- 의존성: [ ] FE-27, FE-13, FE-25, FE-09 · 근거: SC-06, BR-04, BR-10

**FE-29. ChatInput 메시지 유형 선택 확장**
- [ ] 일반/변경요청 작성 모드 토글, 변경요청 선택 시 FE-28 노출.
- 의존성: [ ] FE-25, FE-28

**FE-30. ChangeRequestStatusBadge + 액션 버튼**
- [ ] 상태별 배지 표시.
- [ ] 대기 상태에 한해 팀장은 승인/거절, 요청자 본인은 취소 버튼만 노출, 제3자는 미노출(권한 매트릭스).
- [ ] 처리 완료 후 액션 버튼 사라지고 최종 상태만 표시.
- 의존성: [ ] FE-24, FE-27, FE-09

**FE-31. 팀장 승인/거절 처리 흐름 연동**
- [ ] 승인 성공 시 캘린더 즉시 갱신(SC-07).
- [ ] 거절 시 일정 불변 확인(SC-08).
- [ ] 자동 거절된 나머지 요청도 화면에 정확히 반영(SC-09, BR-11).
- [ ] 중복 처리 시도 시 409 메시지 노출(SC-07 E2, SC-09 E1).
- [ ] 팀원에게 승인/거절 유도 UI 없음(BR-05).
- 의존성: [ ] FE-30, FE-27, FE-19/FE-20

**FE-32. 요청자 본인 취소 흐름 연동**
- [ ] 대기 상태 본인 요청에만 취소 버튼, 클릭 시 즉시 상태 갱신(SC-10).
- [ ] 처리 완료/타인 요청에는 버튼 비노출(SC-10 E1/E2 UX).
- 의존성: [ ] FE-30, FE-27

**FE-33. 시스템 메시지 렌더링**
- [ ] 승인/거절/자동거절/취소 처리 결과가 "[시스템]" 형태로 구분 표시(BR-13).
- [ ] 작성자 없는(nullable) 메시지도 정상 렌더링(ENT-06).
- 의존성: [ ] FE-24, FE-31, FE-32

---

### Day 5 — 통합 테스트 및 배포

#### DB 트랙

**DB-19. DB 레벨 제약 통합 검증** *(범위 축소: 트리거 검증 항목 제외, 구조적 제약만 재검증)*
- [x] `users.email`, `team_memberships(team_id,user_id)`, `schedule_participants(schedule_id,user_id)`, `schedule_change_requests.message_id` 4개 UNIQUE 제약을 위반 INSERT로 재확인.
- [x] `schedules.end_time > start_time`, `messages` type-author 조합 CHECK 제약을 위반 INSERT로 재확인.
- [x] BR-06/09/11/12/13(구 트리거 대상)은 DB가 아닌 **BE-25**(백엔드 통합 QA)에서 검증됨을 확인 — 중복 검증 불필요.
- [x] 발견된 결함은 새 마이그레이션 파일로 추가, 기존 마이그레이션 파일은 수정하지 않음(결함 미발견으로 신규 마이그레이션 없음).
- 의존성: [x] DB-05, DB-07, DB-09, DB-10 · 근거: PRD 10장 Day5

#### Backend 트랙

**BE-25. SC-01~12 통합 수동 QA + BR-01~16 체크리스트 검증**
- [x] SC-01~SC-12 기본 흐름이 문서상 사후조건과 동일하게 재현됨.
- [x] 모든 예외 흐름(E1, E2 등)이 명시된 상태 코드/메시지대로 동작.
- [x] BR-01~BR-16 전체 체크리스트 통과(크리티컬 버그 0건).
- [x] 발견된 버그는 즉시 수정 및 재검증(일정 상세 조회 라우팅 누락 1건 수정 — `backend/docs/qa/be-25-sc-walkthrough.md` 참고).
- 의존성: [x] BE-01~BE-24 전체, DB-01~DB-13/15/19 · 근거: SC-01~SC-12, PRD 5.1절

**BE-26. 배포 설정 및 최종 점검**
- [x] `.env` 설정으로 서버 정상 기동 및 DB 연결.
- [x] `.env.example`이 최신 환경변수와 일치.
- [x] 캐시/오토스케일링/CI-CD 등 범위 외 인프라 미추가 확인.
- [x] 재시작 후 기존 데이터 유지 확인.
- 의존성: [x] BE-25

#### Frontend 트랙

**FE-34. SC-01~12 수동 시나리오 워크스루 및 버그 픽스**
- [ ] SC-01~SC-12 기본 흐름 + 예외 흐름 최소 1개씩 화면에서 재현·통과.
- [ ] BR-01~BR-16 대응 UI 동작 전수 확인.
- [ ] 크리티컬 버그 0건까지 수정.
- 의존성: [ ] FE-01~FE-33 전체, [ ] BE-25(백엔드 API 가동)

**FE-35. 반응형 레이아웃 점검**
- [ ] 데스크톱/대표 모바일 폭(375px)에서 캘린더·채팅 레이아웃 정상.
- [ ] 네이티브 앱 대응, 접근성 별도 작업 없음(PRD 정합).
- 의존성: [ ] FE-21, FE-26

**FE-36. 프론트엔드 배포 빌드 설정**
- [ ] `npm run build` 정상 생성, 프로덕션 API base URL 환경변수 주입.
- [ ] `.env`는 미커밋, `.env.example`만 커밋.
- [ ] CI/CD, CDN 등 범위 외 작업 없음.
- 의존성: [ ] FE-34, [ ] BE-26(배포 URL 확정)

---

## 3. 부록

### 3.1 BR-xx → 소유 Task 매핑 (§1.1 반영 최종본)

| BR | 구현 방식 | 소유 Task |
|---|---|---|
| BR-01 | 인증 미들웨어 | BE-03 |
| BR-02, BR-03 | Service 계층 역할 검증 | BE-12, BE-13, BE-14 |
| BR-04 | `message_id` UNIQUE FK(구조) + 참여자 검증(Service) | DB-10, BE-18 |
| BR-05 | Service 계층 팀장 검증 | BE-20, BE-21 |
| BR-06 | 수정/삭제 엔드포인트 미구현 | BE-16 |
| BR-07 | `schedules.team_id NOT NULL FK`(구조) | DB-07 |
| BR-08 | `UNIQUE(team_id,user_id)`, `user_id` 단독 유니크 없음(구조) | DB-05 |
| BR-09 | Service 계층 팀장 수 검증 | BE-10, BE-11 |
| BR-10 | Service 계층 참여자 검증 | BE-18 |
| BR-11 | Service 계층 자동 거절 | BE-20, BE-24 |
| BR-12 | Service 계층 상태 전이 검증 | BE-22, BE-24 |
| BR-13 | Service 계층 시스템 메시지 생성 | BE-20, BE-21 |
| BR-14 | 이메일 검색 기반 즉시 추가 | BE-09 |
| BR-15 | 생성자 자동 팀장 등록 | BE-08 |
| BR-16 | 팀 경계 접근 제어 미들웨어 | BE-04 |

### 3.2 PRD Must-have 14개 ↔ 대표 Task 매핑

| PRD Must-have | DB | Backend | Frontend |
|---|---|---|---|
| 회원가입/로그인 | DB-03 | BE-06, BE-07 | FE-03, FE-06 |
| 팀 생성(자동 팀장 등록) | DB-04, DB-05 | BE-08 | FE-08, FE-10, FE-11 |
| 팀원 초대(이메일 검색 즉시 추가) | DB-05 | BE-09 | FE-08, FE-11 |
| 팀-사용자 소속/역할 | DB-05 | BE-08~10 | FE-09, FE-12 |
| 팀 일정 월/주/일 조회 | DB-11, DB-13 | BE-14 | FE-15~18, FE-21 |
| 팀 일정 CRUD(팀장 전용) | DB-07, DB-08 | BE-12, BE-13 | FE-19, FE-20 |
| 참여자 지정 | DB-08 | BE-12 | FE-19 |
| 채팅+일자별 이력 | DB-09, DB-11, DB-15 | BE-16, BE-17 | FE-22~25 |
| 변경 요청 제기 | DB-10 | BE-18 | FE-28, FE-29 |
| 변경 요청 승인/거절 | — | BE-20, BE-21 | FE-30, FE-31 |
| 복수 대기 요청 자동 거절 | — | BE-20, BE-24 | FE-31, FE-33 |
| 요청자 본인 취소 | — | BE-22 | FE-32 |
| 처리 결과 채팅 기록 | — | BE-20, BE-21 | FE-33 |
| 팀장 최소 1인 유지 | — | BE-10, BE-11 | FE-12 |

### 3.3 Day별 완료 게이트 요약

- [ ] **Day 1 완료 조건**: DB-01~12, BE-01~11, FE-01~12 전체 체크 완료 — 로그인 후 팀 생성/팀원 추가/역할 관리가 API~UI까지 동작.
- [ ] **Day 2 완료 조건**: DB-13, BE-12~15, FE-13~21 전체 체크 완료 — 팀장이 일정을 CRUD하고 팀원이 월/주/일로 조회 가능.
- [ ] **Day 3 완료 조건**: DB-15, BE-16~17, FE-22~26 전체 체크 완료 — 캘린더와 채팅이 한 화면에서 동시 동작, 일자별 이력 조회 가능.
- [ ] **Day 4 완료 조건**: BE-18~24, FE-27~33 전체 체크 완료 — 변경 요청 제기→승인/거절/자동거절/취소→시스템 메시지 기록까지 전체 플로우 동작.
- [ ] **Day 5 완료 조건**: DB-19, BE-25~26, FE-34~36 전체 체크 완료 — SC-01~12 전량 재현, BR-01~16 체크리스트 전량 통과, 배포 가능 상태.
