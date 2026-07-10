# Team CalTalk 기술 아키텍처 다이어그램

## 참고 문서
1. `docs/1-domain-definition.md` (v1.2) — 엔티티(ENT-01~07), 비즈니스 규칙(BR-01~16)
2. `docs/2-PRD.md` (v1.1) — 9장 기술 아키텍처 개요(React / Node.js+Express / PostgreSQL, REST API)
3. `docs/3-user-scenarios.md` (v1.1) — SC-06(변경 요청 제기), SC-07(승인) 시나리오
6. `docs/6-project-structure.md` — 백엔드 4개 기능 모듈(auth / team-schedule / chat / change-request) 및 계층 구조(Route→Service→Query, Page→Component→Hook/Context→API Client)

본 문서는 PRD 9장이 정한 3계층(React 프론트엔드 / Node.js+Express 백엔드 / PostgreSQL)만을 대상으로 하며, 문서에 근거 없는 캐시·메시지 브로커·별도 인증 서버 등은 포함하지 않는다.

---

## 1. 전체 시스템 구성도

React 프론트엔드가 REST API를 통해 Node.js+Express 백엔드의 4개 기능 모듈(auth / team-schedule / chat / change-request)을 호출하고, 각 모듈은 자신의 Route→Service→Query 계층을 거쳐 단일 PostgreSQL 데이터베이스에 접근하는 3단 구조를 보여준다.

```mermaid
flowchart TB
    subgraph FE["React 프론트엔드 (브라우저)"]
        direction TB
        Page["Page<br/>라우트 단위 화면"]
        Component["Component<br/>재사용 가능한 UI"]
        HookCtx["Hook / Context<br/>인증 · 팀 공유 상태"]
        ApiClient["API Client<br/>REST 엔드포인트 호출"]
        Page --> Component --> HookCtx --> ApiClient
    end

    subgraph BE["Node.js + Express REST API"]
        direction TB

        subgraph M_AUTH["auth 모듈 (인증, BR-01)"]
            direction TB
            AuthRoute["Route"] --> AuthService["Service"] --> AuthQuery["Query"]
        end

        subgraph M_TS["team-schedule 모듈 (팀 · 일정 관리, BR-02·03·07~09·14~16)"]
            direction TB
            TsRoute["Route"] --> TsService["Service"] --> TsQuery["Query"]
        end

        subgraph M_CHAT["chat 모듈 (채팅, BR-06·13)"]
            direction TB
            ChatRoute["Route"] --> ChatService["Service"] --> ChatQuery["Query"]
        end

        subgraph M_CR["change-request 모듈 (일정 변경 요청 처리, BR-04·05·10~13)"]
            direction TB
            CrRoute["Route"] --> CrService["Service"] --> CrQuery["Query"]
        end
    end

    DB[("PostgreSQL<br/>ENT-01~07 대응 테이블")]

    ApiClient -- "REST API 호출" --> AuthRoute
    ApiClient -- "REST API 호출" --> TsRoute
    ApiClient -- "REST API 호출" --> ChatRoute
    ApiClient -- "REST API 호출" --> CrRoute

    CrService -. "일정 갱신은 team-schedule Service 호출로 위임 (BR-05)" .-> TsService
    CrService -. "처리 결과 시스템 메시지는 chat Service 호출로 위임 (BR-13)" .-> ChatService

    AuthQuery --> DB
    TsQuery --> DB
    ChatQuery --> DB
    CrQuery --> DB
```

---

## 2. 핵심 데이터 흐름 시퀀스 다이어그램

팀원이 자신이 참여자로 지정된 일정에 대해 채팅으로 변경을 요청하고(BR-04, BR-10), 팀장이 이를 승인하면 실제 Schedule에 반영되며(BR-05) 그 처리 결과가 시스템 메시지로 채팅 이력에 자동 기록되는(BR-13) 대표 흐름이다(SC-06, SC-07 대응).

```mermaid
sequenceDiagram
    participant Member as "팀원 (브라우저)"
    participant Leader as "팀장 (브라우저)"
    participant CR as "change-request 모듈"
    participant TS as "team-schedule 모듈"
    participant Chat as "chat 모듈"
    participant DB as "PostgreSQL"

    Member->>CR: POST /schedules/:id/change-requests (변경 요청 제기)
    CR->>TS: 참여자 여부 확인 요청 (BR-10)
    TS->>DB: schedule_participants 조회
    DB-->>TS: 참여자 목록 반환
    TS-->>CR: 참여자 검증 결과 (참여자 맞음)
    CR->>DB: schedule_change_requests INSERT (상태=대기)
    CR-->>Member: 요청 접수 완료 (대기중)

    Leader->>CR: PATCH /change-requests/:id/approve (승인, BR-05)
    CR->>TS: updateScheduleFields() 호출 (제안 값 반영)
    TS->>DB: schedules UPDATE
    CR->>DB: schedule_change_requests 상태=승인 UPDATE, 동일 일정 대기 요청 자동 거절 (BR-11)
    CR->>Chat: 처리 결과 시스템 메시지 생성 요청 (BR-13)
    Chat->>DB: messages INSERT (유형=시스템 처리결과)
    CR-->>Leader: 승인 완료 응답

    Member->>Chat: GET /teams/:teamId/messages?date= (일자별 채팅 이력 조회)
    Chat->>DB: messages 조회 (작성일시 기준)
    DB-->>Chat: 변경요청 메시지 + 시스템 처리결과 메시지 반환
    Chat-->>Member: 채팅 이력 응답 (승인 결과 확인)
```
