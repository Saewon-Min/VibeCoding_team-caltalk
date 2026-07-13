# CLAUDE.md

이 파일은 이 저장소에서 작업할 때 Claude Code(claude.ai/code)에게 제공되는 가이드다.

## 핵심 지침 (최우선)

- **오버엔지니어링 금지**: 문서(`docs/`)에 근거 없는 추상화·기술·계층을 도입하지 않는다. 5일×1인 개발 MVP 범위를 벗어나는 선반영(캐시, 메시지 브로커, 별도 인증 서버, 리포지토리 인터페이스, DDD 애그리게잇 등)을 하지 않는다. 자세한 근거는 `docs/6-project-structure.md` "기본 전제"·"최상위 원칙" 참조.
- **모든 처리 결과 설명은 한국어로 작성한다.**

## 프로젝트 현황

**Team CalTalk**은 4~10인 소규모 팀을 위한 팀 캘린더 + 팀 채팅 통합 도구다(MVP, 5일×1인 개발 계획). 이 저장소는 현재 **기획/설계 산출물 단계**이며, 문서에서 설명하는 `frontend/`, `backend/` 구현 트리는 아직 존재하지 않는다. 현재 존재하는 것은 다음과 같다.

- `docs/` — 전체 기획 문서 체인(아래 표 참조). 모든 설계 결정의 실제 근거(source of truth).
- `swagger/swagger.json` — 문서를 근거로 작성된 OpenAPI 3.0 스펙. API 계약(contract).
- `mockup/` — `swagger/swagger.json`을 `openapi-mock-express-middleware`(모의 응답)와 Swagger UI로 서빙하는 임시 Express 목서버. 실제 `backend/`가 생기기 전에 API 계약을 미리 확인/실행해보기 위한 용도.

`frontend/` 또는 `backend/` 코드 구현을 요청받으면, 구조를 새로 고안하지 말고 `docs/6-project-structure.md`를 그대로 따른다 — 이미 두 영역의 전체 디렉토리 구조, 계층 규칙, 네이밍 컨벤션이 명시되어 있다.

## 명령어

`frontend/`/`backend/`는 아직 스캐폴딩되지 않아 빌드/린트/테스트 도구가 없다. 현재 실행 가능한 것은 목서버뿐이다.

```bash
cd mockup
npm install                # express, openapi-mock-express-middleware, swagger-ui-express, nodemon
node server.js              # 또는: npx nodemon server.js (mockup/package.json에 npm script가 정의되어 있지 않음)
```

이 서버는 `swagger/swagger.json`의 모든 경로에 대한 모의 응답을 `/api` 하위에서 제공하고, Swagger UI를 `/docs`에서 제공하며, 포트 3000에서 동작한다.

`docs/6-project-structure.md`에 따라 `backend/`/`frontend/`가 스캐폴딩되면(아직 구현 안 됨) 의도된 컨벤션은 다음과 같다: 각 패키지에 동일한 규칙 세트를 공유하는 ESLint + Prettier, `npm run lint`, 그리고 대응하는 Service 파일명을 딴 `backend/tests/unit/<module>/` 하위 백엔드 단위 테스트(예: `change-request.service.test.js`) — 아래 "테스트 전략" 참조.

## 문서 체인 — 아래 순서대로 읽으며, 각 문서는 이전 문서를 근거로 삼는다

| # | 문서 | 정의하는 내용 | 핵심 ID |
|---|---|---|---|
| 1 | `docs/1-domain-definition.md` | 공통 언어(Ubiquitous Language): 엔티티, 역할, 비즈니스 규칙, 용어 — **비즈니스 규칙의 근거 문서** | `ENT-01~07`, `BR-01~16`, `TERM-01~10`, `ROLE-01/02` |
| 2 | `docs/2-PRD.md` | MoSCoW 범위, 비기능 요구사항(8.2 = 인증/인가 최소 요건), 기술 스택, 5일 마일스톤 계획 | `BR-xx` 인용 |
| 3 | `docs/3-user-scenarios.md` | 기능별 구체적 기본/예외 흐름, 전 문서에서 재사용되는 예시 데이터(테크팀/김철수/이서연 등) | `SC-01~12` |
| 4 | `docs/4-database-erd.md` | 7개 테이블의 Mermaid ERD, 그리고 어떤 `BR-xx`가 DB로 강제 불가능하여 애플리케이션 계층이 담당해야 하는지 명시한 표 | ENT→테이블 매핑 |
| 5 | `docs/5-arch-diagram.md` | 백엔드 4개 모듈(auth / team-schedule / chat / change-request), Route→Service→Query 계층, 변경요청 흐름 시퀀스 다이어그램 1건 | |
| 6 | `docs/6-project-structure.md` | `frontend/`/`backend/`의 실제 디렉토리 구조, 계층 규칙, 네이밍 컨벤션, REST 경로 컨벤션 | |
| 7 | `docs/7-execution-plan.md` | Day별 작업 분해; **§1에서 DB/Backend/Frontend를 별도 에이전트가 설계하며 발생한 충돌을 명시적으로 조정**(아래 참조) | `DB-xx`, `BE-xx`, `FE-xx` |
| 8 | `docs/8-wireframes.md` | 라우트/시나리오에 매핑된 13개 화면(저충실도 ASCII 와이어프레임) | `WF-01~13` |

모든 문서는 이 ID 체계로 서로를 상호 참조한다(예: 어떤 엔드포인트의 동작을 설명할 때 `BR-10`을 인용하는데, 이는 문서 1에서만 완전히 정의됨). 한 문서를 변경할 때는 그 문서가 정의한 ID가 다른 곳에서 인용되고 있는지 확인하고 참조의 일관성을 유지해야 한다.

## 핵심 아키텍처 결정: BR-xx 규칙이 위치하는 곳

`docs/7-execution-plan.md` §1.1은 `BR-06, BR-09, BR-11, BR-12, BR-13`을 PostgreSQL 트리거로 구현하자는 이전 제안(DB 담당 서브에이전트)을 뒤집는다. **최종 결정: 비즈니스 규칙 검증과 워크플로 로직은 오직 백엔드 Service 계층에만 존재한다 — DB 트리거로 구현하지 않으며, 프론트엔드를 신뢰 경계로 사용하지 않는다.**

- **DB 계층**은 호출자와 무관하게 항상 참이어야 하는 구조적 불변조건만 강제한다: FK 제약, `UNIQUE`, 단순 `CHECK`(예: `end_time > start_time`, `message_type`/`author_id` nullable 조합, 이메일 유일성). DB 제약으로 커버할 수 *없는* 규칙 전체 목록은 `docs/4-database-erd.md` §4 참조.
- **백엔드 Service 계층**이 역할/상태 기반 검증을 전부 소유한다(BR-02/03/05 역할 검증, BR-09 최소 팀장 수, BR-10 참여자 검증, BR-11 복수 대기요청 자동 거절, BR-12 취소 자격, BR-13 시스템 메시지 생성) — 전체 BR→계층 매핑표는 `docs/6-project-structure.md` §2.2 참조.
- **프론트엔드**는 어떤 BR-xx도 신뢰 경계로 재구현하지 않는다 — 클라이언트 측 검증(버튼 비활성화, 폼 숨김 등)은 UX 편의일 뿐이며, 실제로 규칙을 강제하는 것은 서버 측 검증이다(PRD 8.2).

모듈 경계(auth / team-schedule / chat / change-request)는 엄격하다: 한 모듈의 Service가 다른 모듈의 데이터를 다뤄야 하면 그 모듈이 공개한 Service 함수를 호출해야 하며(예: change-request가 team-schedule의 `updateScheduleFields()`를 호출), 해당 모듈의 Query 계층을 직접 호출해서는 안 된다(`docs/6-project-structure.md` §2.3).

## REST API 컨벤션

팀에 귀속된 리소스는 `/api/teams/:teamId/...` 하위에 중첩시켜 팀 경계 접근 검증(`BR-16`)이 URL 구조 자체에서 드러나도록 하며, 이는 해당 모든 라우트에 공통 `team-access` 미들웨어로 강제된다. `swagger/swagger.json`이 이에 대한 권위 있는 계약(이미 작성됨)이다 — 엔드포인트를 추가/변경할 때는 스펙을 갱신하고 `docs/7-execution-plan.md`의 `BE-xx` 작업으로 추적 가능하게 유지하며, 문서에 근거 없는 엔드포인트를 만들지 않는다(범위 외 항목은 `docs/2-PRD.md` §6.2 / §12에 명시 — 예: 외부 캘린더 연동, 네이티브 모바일 앱, 관리자 콘솔, 메시지 수정/삭제 없음).

## 테스트 전략 (backend/frontend 구현 이후)

`docs/6-project-structure.md` §4에 따라 이 프로젝트는 커버리지 목표를 의도적으로 두지 않는다. 대신 엣지 케이스가 많은 규칙의 자동화를 우선한다: `BR-09`(최소 팀장 수), `BR-11`(동시 대기 요청 중 하나 승인 시 나머지 자동 거절), `BR-12`(취소 자격 상태 전이), `BR-10`/`BR-16`(접근 제어). 그 외는 `docs/3-user-scenarios.md`의 `SC-01~SC-12`를 QA 체크리스트로 수동 워크스루하는 것으로 대체하며 자동화 테스트를 두지 않는다 — 이는 5일 일정에 맞춘 의도적인 범위 결정이며, 광범위한 테스트 커버리지를 추가해 "고쳐야 할" 공백이 아니다.
