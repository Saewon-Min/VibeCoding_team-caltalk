# Team CalTalk 프로젝트 구조 설계 원칙

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| v1.0 | 2026-07-10 | Team CalTalk 풀스택 아키텍처 | 최초 작성 |

## 문서 개요

### 목적
본 문서는 "Team CalTalk"의 코드베이스를 어떻게 디렉토리·파일·계층 단위로 조직할 것인지에 대한 설계 원칙을 정의한다. 도메인 정의서의 엔티티(ENT-xx)·비즈니스 규칙(BR-xx)이 코드 어느 위치에서 구현·검증되어야 하는지, PRD가 정한 기술 스택과 5일×1인 개발 일정 안에서 실제로 지킬 수 있는 수준의 구조가 무엇인지를 다룬다. 상세 DB 스키마, API 명세는 본 문서 범위 밖이며 후속 산출물에서 다룬다.

### 참고 문서
1. `docs/1-domain-definition.md` (v1.2) — 엔티티(ENT-01~07), 비즈니스 규칙(BR-01~16), 용어(TERM-xx)
2. `docs/2-PRD.md` (v1.1) — 9장 기술 아키텍처(React / Node.js+Express / PostgreSQL, REST API), 10장 5일×1인 마일스톤, 7장 기능 범위
3. `docs/3-user-scenarios.md` (v1.1) — SC-01~SC-12 사용자 시나리오
4. `docs/5-arch-diagram.md` — 백엔드 4개 기능 모듈(인증 / 팀·일정 관리 / 채팅 / 일정 변경 요청 처리) 및 3계층 구조

### 기본 전제
5일×1인 개발이라는 제약상, 본 문서의 모든 원칙은 "이상적으로 완벽한 구조"보다 "1인 개발자가 5일 동안 예측 가능하게 지킬 수 있는 일관된 구조"를 우선한다. 불필요한 추상화 계층(리포지토리 인터페이스, DDD 애그리게잇, 헥사고날 포트/어댑터 등)이나 문서에 근거 없는 도구(Redis, GraphQL, 특정 ORM, 상태관리 라이브러리 등)는 도입하지 않는다.

---

## 1. 모든 스택에 공통인 최상위 원칙

| 원칙 | 내용 | 근거 |
|---|---|---|
| 완벽함보다 예측 가능성 | 계층/디렉토리 수를 최소화하고, 한 번 정한 패턴은 프론트/백엔드 전 영역에서 동일하게 반복한다 | 5일×1인 개발에서는 매번 새로운 구조를 판단하는 비용이 가장 크다 |
| 관심사 분리(SoC) | 화면(표현) · 업무 규칙(BR-xx) · 데이터 접근을 서로 다른 파일/계층에 둔다 | BR-xx 로직이 화면 코드나 SQL 코드에 흩어지면 5일 안에 회귀 없이 수정하기 어렵다 |
| 단일 진실 공급원(Single Source of Truth) | 도메인 규칙(BR-xx)의 검증 로직은 백엔드 서비스 계층에만 존재한다. 프론트엔드의 동일 로직은 UX 보조(버튼 비활성화 등)일 뿐 신뢰 기준이 아니다 | 클라이언트는 우회 가능하므로 서버 측 검증만이 신뢰 기준이다(PRD 8.2) |
| 모노레포, 최상위 2분할 | 하나의 저장소 안에 `frontend/`, `backend/`를 최상위로 두는 모노레포 구조를 채택하고 별도 저장소로 분리하지 않는다 | 1인 개발자가 프론트/백엔드를 오가며 작업하므로 저장소 분리는 관리 비용만 늘린다 |
| 도메인 용어와 코드 용어 일치 | ENT-xx 엔티티명, TERM-xx 용어는 테이블명·모듈명·클래스명·변수명에 그대로 반영한다(3장 참조) | 도메인 정의서가 Ubiquitous Language로 설계된 목적을 코드에서도 유지하기 위함 |
| 기능 모듈 경계 유지 | 백엔드는 `5-arch-diagram.md`의 4개 기능 모듈(인증 / 팀·일정 관리 / 채팅 / 일정 변경 요청 처리) 경계를 디렉토리 경계로 그대로 사용한다 | 이미 합의된 아키텍처 문서와의 정합성을 유지해 재설계 비용을 없앤다 |
| 문서에 없는 기술 도입 금지 | React / Node.js+Express / PostgreSQL / REST API 외의 기술(캐시, 메시지 브로커, 별도 인증 서버 등)은 구조에 반영하지 않는다 | PRD 9장이 명시한 MVP 범위를 벗어난 구조적 선반영은 5일 일정에 방해가 된다 |

---

## 2. 의존성/레이어 원칙

### 2.1 계층과 의존 방향

상위 계층(사용자에 가까운 계층)은 하위 계층에 의존할 수 있지만, 하위 계층은 상위 계층을 알아서는 안 된다. 계층은 다음 3단으로 고정하며 그 이상 세분화하지 않는다.

**백엔드**

| 계층 | 역할 | 의존 대상 |
|---|---|---|
| Route(핸들러) | HTTP 요청 파싱, 응답 형식 변환, 인증/역할 미들웨어 연결 | Service |
| Service | BR-xx 비즈니스 규칙 검증 및 처리, 트랜잭션 경계 관리 | Query(Data Access) |
| Query(Data Access) | SQL 실행, PostgreSQL과의 입출력만 담당 | 없음(PostgreSQL만) |

컨트롤러를 별도 파일로 분리하지 않고 Route 핸들러가 얇은 컨트롤러 역할을 겸한다. 이는 레이어를 더 쪼개지 말라는 제약(과잉 엔지니어링 금지)에 따른 의도적 단순화다.

**프론트엔드**

| 계층 | 역할 | 의존 대상 |
|---|---|---|
| Page | 라우트 단위 화면 조합, 데이터 로딩 트리거 | Component, Hook |
| Component | 재사용 가능한 UI 단위(캘린더 셀, 채팅 메시지 등) | Hook, API Client(간접) |
| Hook/Context | 인증 상태, 팀 컨텍스트 등 화면 간 공유 상태 관리 | API Client |
| API Client | REST 엔드포인트 호출 및 응답/에러 형식 통일 | 없음(백엔드 REST API만) |

### 2.2 BR-xx 검증 로직의 위치

BR-xx는 예외 없이 백엔드 Service 계층에서 검증한다. Route는 인증 여부만 미들웨어로 확인해 통과시키고, Query는 검증 없이 Service가 지시한 SQL만 실행한다.

| 검증 대상 규칙 | 위치 |
|---|---|
| BR-01(인증), BR-16(팀 경계 접근 제어) | 공통 미들웨어(모든 팀 자원 Route 진입 전 강제) |
| BR-02, BR-03, BR-05(역할 기반 쓰기 권한) | 해당 기능 모듈의 Service |
| BR-04, BR-10(변경 요청 자격 검증) | change-request 모듈 Service |
| BR-09(팀장 최소 1인), BR-11(복수 대기 요청 자동 거절), BR-12(취소 자격) | 해당 Service 내부에서 트랜잭션으로 원자적 처리 |
| BR-06, BR-13(채팅 이력 보존, 처리 결과 기록) | chat/change-request 모듈 Service |

### 2.3 순환 의존 방지

- 기능 모듈(auth / team-schedule / chat / change-request) 간에는 서로의 Query(Data Access) 계층을 직접 import하지 않는다. 다른 모듈의 데이터가 필요하면 해당 모듈이 공개하는 Service 함수를 호출한다. 예: change-request 모듈이 일정을 갱신할 때는 team-schedule 모듈의 `updateScheduleFields()`형 서비스 함수를 호출하고, schedules 테이블에 직접 SQL을 쓰지 않는다.
- 여러 모듈이 공통으로 쓰는 코드(미들웨어, 날짜 유틸, 에러 클래스 등)는 `shared/`(백엔드) 또는 `utils/`(프론트엔드)에 두고, 모듈은 `shared/utils`를 참조할 수 있지만 `shared/utils`는 특정 모듈을 참조하지 않는다.
- 프론트엔드 Component는 Page를 import하지 않는다(역방향 금지). 상태는 항상 상위(Page/Context)에서 하위(Component)로 내려준다.

---

## 3. 코드/네이밍 원칙

### 3.1 파일·디렉토리·변수 네이밍 컨벤션

| 대상 | 컨벤션 | 예시 |
|---|---|---|
| 디렉토리, 일반 파일 | kebab-case | `change-request/`, `schedule.service.js` |
| 백엔드 계층 접미사 | `.routes.js` / `.service.js` / `.queries.js` | `message.service.js` |
| React 컴포넌트 파일/함수 | PascalCase | `CalendarMonthView.jsx` |
| 변수, 함수 | camelCase | `getScheduleParticipants` |
| 상수 | UPPER_SNAKE_CASE | `SCHEDULE_STATUS.PENDING` |
| DB 테이블/컬럼 | snake_case, 테이블명은 복수형 | `schedule_change_requests`, `created_at` |

### 3.2 도메인 용어와 코드 명명 일치

ENT-xx는 테이블명·모듈명·핵심 클래스(또는 객체) 이름에 그대로 매핑한다. 코드 리뷰나 디버깅 시 도메인 정의서를 별도로 찾아보지 않아도 대응 관계가 드러나야 한다.

| ENT/TERM ID | 도메인 명칭 | DB 테이블명 | 백엔드 모듈 |
|---|---|---|---|
| ENT-01 | User | `users` | auth |
| ENT-02 | Team | `teams` | team-schedule |
| ENT-03 | TeamMembership | `team_memberships` | team-schedule |
| ENT-04 | Schedule | `schedules` | team-schedule |
| ENT-05 | ScheduleParticipant | `schedule_participants` | team-schedule |
| ENT-06 | Message | `messages` | chat |
| ENT-07 | ScheduleChangeRequest | `schedule_change_requests` | change-request |

### 3.3 API 엔드포인트 네이밍(REST 리소스 기준)

리소스는 복수 명사로 표현하고, 팀에 귀속된 자원(BR-07, BR-16)은 반드시 `/teams/:teamId` 하위 경로로 중첩시켜 "팀 경계"가 URL 구조에서도 드러나게 한다. 상태 전이(승인/거절/취소)처럼 CRUD로 표현하기 애매한 동작만 예외적으로 동사형 하위 경로를 허용한다.

| 기능 | 메서드/경로 | 관련 BR |
|---|---|---|
| 회원가입 | `POST /api/auth/signup` | BR-01 |
| 로그인 | `POST /api/auth/login` | BR-01 |
| 팀 생성 | `POST /api/teams` | BR-15 |
| 팀원 검색·추가 | `GET /api/teams/:teamId/members?email=`, `POST /api/teams/:teamId/members` | BR-14 |
| 팀원 역할 변경/제외 | `PATCH /api/teams/:teamId/members/:userId`, `DELETE /api/teams/:teamId/members/:userId` | BR-09 |
| 일정 월/주/일 조회 | `GET /api/teams/:teamId/schedules?view=month\|week\|day&date=` | BR-03, BR-16 |
| 일정 생성 | `POST /api/teams/:teamId/schedules` | BR-02, BR-07 |
| 일정 수정/삭제 | `PATCH /api/schedules/:scheduleId`, `DELETE /api/schedules/:scheduleId` | BR-02, BR-03 |
| 일자별 채팅 이력 조회 | `GET /api/teams/:teamId/messages?date=YYYY-MM-DD` | BR-06, BR-16 |
| 채팅 메시지 작성 | `POST /api/teams/:teamId/messages` | BR-01, BR-06 |
| 변경 요청 제기 | `POST /api/schedules/:scheduleId/change-requests` | BR-04, BR-10 |
| 변경 요청 승인/거절 | `PATCH /api/change-requests/:id/approve`, `PATCH /api/change-requests/:id/reject` | BR-05, BR-11, BR-13 |
| 변경 요청 취소 | `PATCH /api/change-requests/:id/cancel` | BR-12 |

---

## 4. 테스트/품질 원칙

PRD 8장·11장은 5일 일정상 자동화 테스트보다 BR-01~BR-16 체크리스트 기반 수동 검증에 무게를 둔다(리스크 "테스트 커버리지 부족" 대응 방향). 본 구조 원칙도 이를 그대로 따른다.

| 원칙 | 내용 |
|---|---|
| 전체 커버리지 목표 지양 | 커버리지 수치 목표를 세우지 않는다. 대신 "동시성/상태전이가 얽힌 규칙"을 자동화 테스트 우선순위로 삼는다. |
| 자동화 우선순위(Service 단위 테스트) | BR-09(팀장 최소 1인), BR-11(복수 대기 요청 자동 거절), BR-12(취소 자격), BR-10/BR-16(접근 제어)처럼 엣지 케이스가 많고 수동으로 놓치기 쉬운 규칙을 `backend/tests/unit`에서 Service 계층 단위로 검증한다. |
| 나머지는 시나리오 워크스루로 검증 | `3-user-scenarios.md`의 SC-01~SC-12를 그대로 QA 체크리스트로 재사용하여 Day 5에 팀장/팀원 계정으로 수동 워크스루를 수행한다(PRD 5.1, 10장 Day 5). |
| 테스트 위치 | 백엔드는 `backend/tests/unit/<module>/`에 대상 Service와 동일한 이름으로 둔다(예: `change-request.service.test.js`). 프론트엔드는 별도 자동화 테스트를 필수로 두지 않고 수동 시나리오로 대체한다(5일 일정 제약). |
| 최소 품질 게이트 | ESLint + Prettier를 `frontend/`, `backend/` 각각에 설정하고 동일한 규칙 세트를 공유한다. 커밋 전 `npm run lint`를 개발자 관례로 두되, 별도 CI 파이프라인 구축은 이번 범위에 포함하지 않는다. |

---

## 5. 설정/보안/운영 원칙

| 원칙 | 내용 |
|---|---|
| 환경변수 분리 | `backend/.env`(DB 접속정보, 세션/토큰 시크릿, PORT), `frontend/.env`(API base URL)로 패키지별 분리 관리하고, `.env`는 버전관리에서 제외하며 `.env.example`만 커밋한다. |
| 시크릿 관리 | 비밀번호는 평문 저장하지 않고 해시로 저장한다(PRD 8.2). 시크릿 값은 코드에 하드코딩하지 않고 환경변수로만 주입한다. |
| BR-01 강제 위치 | `backend/src/middleware/auth.middleware.js` — 인증이 필요한 모든 Route의 최전방에서 토큰/세션 유효성을 검증하고, 실패 시 팀/일정/채팅 데이터를 전혀 포함하지 않은 401을 반환한다(SC-01 E2와 정합). |
| BR-16 강제 위치 | `backend/src/middleware/team-access.middleware.js` — `:teamId`를 포함한 모든 Route에서 요청자의 `TeamMembership` 존재 여부를 매 요청마다 서버 측에서 검증한다. 일정/채팅 등 팀 하위 자원 접근 시에도 결국 대상 리소스의 소속 팀을 조회해 동일한 검증을 거친다. |
| BR-02/03/05 강제 위치 | 각 기능 모듈 Service 내부에서 요청자의 팀 내 역할(팀장/팀원)을 확인한다. 미들웨어로 일반화하지 않고 Service에 두는 이유는 규칙마다 예외 조건(예: BR-05의 처리자 본인 확인)이 있어 공용 미들웨어로 단순화하기 어렵기 때문이다. |
| 로깅 원칙 | 요청 로그(경량 HTTP 로거 1종)와 에러 로그만 콘솔/파일에 남긴다. 별도 로그 수집·분석 인프라는 구성하지 않는다(PRD 8.1, 8.3 범위와 정합). |
| 배포 원칙 | PRD 9장의 "유료 관리형 서비스에 크게 의존하지 않는 구성"을 따른다. `backend/`는 단일 Node.js 프로세스로 REST API를 구동하고, `frontend/`는 정적 빌드 산출물로 배포한다. PostgreSQL은 단일 인스턴스로 운영하며, 캐시 계층·오토스케일링·다중화·CI/CD 파이프라인 고도화는 이번 범위에 포함하지 않는다(PRD 8.1, 8.3, 11장). |

---

## 6. 프론트엔드/백엔드별 디렉토리 구조

### 6.1 최상위 저장소 구조

```
team-caltalk/
├─ docs/                 # 도메인정의서·PRD·시나리오·아키텍처·본 문서 등 산출물
├─ frontend/             # React 애플리케이션
├─ backend/              # Node.js + Express REST API
└─ README.md
```

### 6.2 프론트엔드(React) 디렉토리 구조

```
frontend/
├─ public/                        # 정적 리소스(HTML 진입점 등)
├─ src/
│  ├─ api/                        # 백엔드 REST 엔드포인트 호출 함수(모듈별 파일 분리)
│  │  ├─ auth.api.js               # 회원가입/로그인 호출
│  │  ├─ team.api.js                # 팀 생성/팀원 관리 호출
│  │  ├─ schedule.api.js            # 일정 CRUD/조회 호출
│  │  ├─ message.api.js             # 채팅 메시지 작성/조회 호출
│  │  └─ change-request.api.js      # 변경 요청 제기/승인/거절/취소 호출
│  ├─ pages/                      # 라우트 단위 화면(Page는 Component를 조합만 함)
│  │  ├─ LoginPage.jsx
│  │  ├─ SignupPage.jsx
│  │  ├─ TeamListPage.jsx           # 소속 팀 목록 및 팀 생성
│  │  ├─ TeamMembersPage.jsx        # 팀원 검색/추가/역할 관리(BR-14, BR-09)
│  │  └─ TeamWorkspacePage.jsx      # 캘린더+채팅 통합 화면(PRD 7장 Should)
│  ├─ components/
│  │  ├─ calendar/                 # 월/주/일 뷰 등 캘린더 UI(BR-03 조회 전용 렌더링 포함)
│  │  │  ├─ CalendarMonthView.jsx
│  │  │  ├─ CalendarWeekView.jsx
│  │  │  ├─ CalendarDayView.jsx
│  │  │  └─ ScheduleFormModal.jsx   # 팀장 전용 생성/수정 폼(BR-02)
│  │  ├─ chat/                     # 채팅 메시지 목록/입력 UI(BR-06)
│  │  │  ├─ ChatHistory.jsx
│  │  │  ├─ ChatMessageItem.jsx
│  │  │  └─ ChatInput.jsx
│  │  ├─ change-request/           # 변경 요청 작성/승인/거절/취소 UI(BR-04~13)
│  │  │  ├─ ChangeRequestForm.jsx
│  │  │  └─ ChangeRequestStatusBadge.jsx
│  │  ├─ team/                     # 팀 생성, 팀원 검색/추가 UI(BR-14, BR-15)
│  │  └─ common/                   # 버튼, 모달 등 도메인 비의존 공통 UI
│  ├─ context/
│  │  └─ AuthContext.jsx            # 로그인 상태·인증 토큰 보관(클라이언트 측 BR-01 UX 보조)
│  ├─ hooks/                       # 화면 간 재사용 로직(예: useTeamSchedules, useChatHistory)
│  ├─ routes/
│  │  └─ ProtectedRoute.jsx         # 미인증 시 로그인 화면으로 이동(서버 측 BR-01 검증의 UX 보조)
│  ├─ utils/                       # 날짜 포맷팅 등 도메인 비의존 유틸
│  ├─ App.jsx                      # 라우트 정의
│  └─ index.jsx                    # 진입점
├─ .env.example
└─ package.json
```

### 6.3 백엔드(Node.js + Express) 디렉토리 구조

기능 모듈 경계는 `5-arch-diagram.md`의 4개 백엔드 기능(인증 / 팀·일정 관리 / 채팅 / 일정 변경 요청 처리)을 그대로 따른다.

```
backend/
├─ src/
│  ├─ modules/
│  │  ├─ auth/                     # 인증 모듈(BR-01)
│  │  │  ├─ auth.routes.js          # /api/auth/* 라우트, 얇은 핸들러
│  │  │  ├─ auth.service.js         # 회원가입/로그인 검증, 비밀번호 해시 처리
│  │  │  └─ auth.queries.js         # users 테이블 SQL
│  │  ├─ team-schedule/            # 팀·일정 관리 모듈(BR-02,03,07~09,14~16)
│  │  │  ├─ team.routes.js          # /api/teams, /api/teams/:teamId/members
│  │  │  ├─ team.service.js         # 팀 생성(BR-15), 팀원 추가(BR-14), 최소 팀장 유지(BR-09)
│  │  │  ├─ team.queries.js         # teams, team_memberships 테이블 SQL
│  │  │  ├─ schedule.routes.js      # /api/teams/:teamId/schedules, /api/schedules/:id
│  │  │  ├─ schedule.service.js     # 일정 CRUD 권한 검증(BR-02,03), 참여자 지정
│  │  │  └─ schedule.queries.js     # schedules, schedule_participants 테이블 SQL
│  │  ├─ chat/                     # 채팅 모듈(BR-06)
│  │  │  ├─ message.routes.js       # /api/teams/:teamId/messages
│  │  │  ├─ message.service.js      # 일자 단위 이력 그룹핑, 메시지 유형 처리
│  │  │  └─ message.queries.js      # messages 테이블 SQL
│  │  └─ change-request/           # 일정 변경 요청 처리 모듈(BR-04,05,10~13)
│  │     ├─ change-request.routes.js  # /api/schedules/:id/change-requests, /api/change-requests/:id/*
│  │     ├─ change-request.service.js # 참여자 검증(BR-10), 승인/거절/자동거절(BR-11), 취소(BR-12)
│  │     └─ change-request.queries.js # schedule_change_requests 테이블 SQL
│  ├─ middleware/
│  │  ├─ auth.middleware.js         # BR-01 인증 검증
│  │  ├─ team-access.middleware.js  # BR-16 팀 경계 접근 제어
│  │  └─ error-handler.js           # 공통 에러 응답 포맷
│  ├─ db/
│  │  ├─ pool.js                   # PostgreSQL 커넥션 풀
│  │  └─ migrations/               # ENT-01~07 대응 스키마 마이그레이션
│  ├─ shared/                      # 여러 모듈이 공유하는 상수/유틸(에러 클래스, 날짜 유틸 등)
│  ├─ app.js                       # Express 앱 조립(미들웨어·라우트 등록)
│  └─ server.js                    # 서버 기동 진입점
├─ tests/
│  └─ unit/                        # BR-09, BR-11, BR-12, BR-16 등 핵심 규칙 우선 단위 테스트
├─ .env.example
└─ package.json
```

---

## 요약

- 최상위 구조는 `frontend/`, `backend/` 2분할 모노레포로, 5일×1인 개발에서 저장소/빌드 관리 비용을 최소화한다.
- 계층은 백엔드 Route→Service→Query, 프론트엔드 Page→Component→Hook/Context→API Client의 3~4단으로 고정하고 그 이상 세분화하지 않는다. BR-xx 검증은 예외 없이 백엔드 Service 계층(및 BR-01/BR-16의 경우 공통 미들웨어)에서 이루어진다.
- 백엔드 `modules/`는 `5-arch-diagram.md`가 정의한 인증 / 팀·일정 관리 / 채팅 / 일정 변경 요청 처리 4개 기능 경계와 1:1로 대응한다.
- 테이블명·모듈명은 ENT-01~07을 그대로 반영하고, API 경로는 팀 하위자원을 `/teams/:teamId` 아래 중첩시켜 BR-16(팀 경계 접근 제어)이 URL 구조에서도 드러나도록 한다.
- 테스트는 전체 커버리지 대신 BR-09/11/12/16처럼 상태 전이·동시성이 얽힌 규칙에 자동화 단위 테스트를 집중하고, 나머지는 `3-user-scenarios.md`의 SC-01~SC-12를 Day 5 수동 QA 체크리스트로 재사용한다.
