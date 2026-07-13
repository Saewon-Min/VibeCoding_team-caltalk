# Team CalTalk Tailwind 스타일 가이드

| 버전 | 일자 | 작성자 | 변경 내용 |
|---|---|---|---|
| v1.0 | 2026-07-13 | Team CalTalk UI 설계 | 참조 스크린샷 기반 최초 작성 |

## 1. 목적 및 범위

본 문서는 팀 워크스페이스(캘린더+채팅 통합 화면, `docs/8-wireframes.md`의 `WF-05`/`WF-06`/`WF-07`/`WF-08`/`WF-11`/`WF-13`)를 실제 구현할 때 참조한 화면 스크린샷을 근거로, Tailwind CSS 유틸리티 클래스로 옮기기 위한 색상·타이포그래피·컴포넌트 규칙을 정의한다. 와이어프레임 문서가 배치와 우선순위를 정의했다면, 본 문서는 그 배치에 입힐 실제 시각 스타일(색, 여백, 모서리, 타이포그래피)을 정의한다.

범위는 스크린샷에 나타난 요소로 한정한다 — 근거 없는 컴포넌트 변형(다중 테마, 애니메이션 라이브러리, 별도 디자인 토큰 빌드 파이프라인 등)은 추가하지 않는다(`CLAUDE.md` 오버엔지니어링 금지 원칙).

현재 `frontend/src/index.css`는 CSS 커스텀 프로퍼티(`--accent: #4f46e5` 등, 인디고 계열) 기반의 최소 스타일로 로그인/회원가입/팀 목록 화면만 구현되어 있다. 본 가이드는 캘린더·채팅 화면(`TeamWorkspacePage` 이후 구현분)에 Tailwind를 도입할 때 적용할 팔레트이며, 스크린샷 근거에 따라 액센트를 블루/그린 계열로 정의한다. 기존 화면(로그인 등)의 인디고 액센트를 이 팔레트로 소급 통일할지는 별도 결정 사항이며 본 문서 범위가 아니다.

## 2. 색상 팔레트

Tailwind 기본 팔레트(`blue`, `emerald`, `gray`, `red`)를 그대로 사용하고 별도 커스텀 색상을 정의하지 않는다. 커스텀 팔레트를 새로 만드는 것은 이번 스크린샷 재현에 필요하지 않다.

| 용도 | Tailwind 클래스 | 사용처 |
|---|---|---|
| Primary(주요 액션) | `bg-blue-600` / `hover:bg-blue-700` / `text-white` | "+ 새 일정" 버튼, 채팅 전송 버튼, 활성 상단 네비게이션 pill |
| Success/Today(일정·활성 표시) | `bg-emerald-500` / `hover:bg-emerald-600` | 월/주/일 토글 중 선택된 뷰, 일정 바(이벤트 블록), 온라인 상태 점 |
| Today 강조 배경 | `bg-emerald-50` | 캘린더에서 오늘 날짜 셀 배경 |
| 본문 텍스트 | `text-gray-900` | 제목, 본문 |
| 보조 텍스트 | `text-gray-500` | 라벨, 타임스탬프, 안내문, "0/500" 카운터 |
| 테두리/구분선 | `border-gray-200` | 카드, 입력창, 그리드 셀, 헤더 하단 |
| 페이지 배경 | `bg-white` | 기본 배경 |
| 패널/헤더 배경 | `bg-gray-50` | 상단 헤더, 하단 상태 바(스크린샷의 옅은 라벤더 톤은 `bg-blue-50`으로 대체) |
| 위험/삭제 | `text-red-600` / `bg-red-50` | 삭제 확인, 오류 문구(`docs/8-wireframes.md` 오류 상태 규칙과 정합) |
| 요일 헤더 강조 | `text-red-500`(일) / `text-blue-500`(토) | 캘린더 요일 헤더, 스크린샷과 동일하게 주말만 강조, 평일은 `text-gray-700` |

다크 모드는 `frontend/src/index.css`가 이미 `prefers-color-scheme: dark`로 대응하고 있으므로, Tailwind 쪽도 `dark:` variant를 `media` 전략(`tailwind.config.js`의 `darkMode: 'media'`)으로 맞춰 별도 테마 토글 UI 없이 시스템 설정을 따른다. 주요 매핑은 다음과 같다.

| 라이트 | 다크 |
|---|---|
| `bg-white` | `dark:bg-gray-900` |
| `bg-gray-50` | `dark:bg-gray-800` |
| `text-gray-900` | `dark:text-gray-100` |
| `text-gray-500` | `dark:text-gray-400` |
| `border-gray-200` | `dark:border-gray-700` |
| `bg-blue-600` | `dark:bg-blue-500` |
| `bg-emerald-500` | `dark:bg-emerald-500`(동일 유지, 대비 충분) |

## 3. 타이포그래피

| 요소 | 클래스 |
|---|---|
| 페이지/워크스페이스 로고("Team CalTalk") | `text-lg font-semibold text-gray-900` |
| 팀명(워크스페이스 타이틀, "MyApp 개발 팀1") | `text-xl font-bold text-gray-900` |
| 섹션 제목("팀 채팅") | `text-base font-semibold text-gray-900` |
| 본문/일반 텍스트 | `text-sm text-gray-900` |
| 보조/메타 텍스트(날짜, 카운터, 안내) | `text-xs text-gray-500` |
| 버튼 라벨 | `text-sm font-medium` |

폰트 패밀리는 시스템 폰트를 그대로 사용한다(`font-sans` 기본값 = Tailwind preflight 기본 스택). 별도 웹폰트를 로드하지 않는다(근거 문서 없음, MVP 범위 외).

## 4. 레이아웃 토큰

| 항목 | 값 | 비고 |
|---|---|---|
| 상단 헤더 높이 | `h-14` | 로고, 전역 내비게이션(대시보드/팀/캘린더/팀명/로그아웃), `border-b border-gray-200` |
| 워크스페이스 좌우 분할 | `grid grid-cols-1 lg:grid-cols-[1fr_360px]` | 좌측 캘린더 가변폭, 우측 채팅 패널 고정폭 360px. `WF-05` 모바일 규칙에 따라 `lg` 미만에서는 1열(탭 전환)로 전환 |
| 반응형 브레이크포인트 | `lg`(1024px) 기준 데스크톱 2단/모바일 탭 전환 | `docs/8-wireframes.md` FE-35(375px) 기준 모바일 값은 Tailwind 기본 브레이크포인트 범위 내에 포함되므로 별도 커스텀 breakpoint 불필요 |
| 카드/모달 모서리 | `rounded-lg`(8px) | 버튼·입력창은 `rounded-md`(6px) |
| 페이지 내부 여백 | `px-4 py-3`(헤더/툴바), `p-4`(패널 내부) | |
| 하단 상태 바 | `h-9 px-4 flex items-center justify-between bg-blue-50 text-xs text-gray-600` | "이번 달 일정: N개", "보기: 월", 우측 정렬 날짜 |

## 5. 컴포넌트 스타일 레시피

### 5.1 버튼

```html
<!-- Primary (예: "+ 새 일정") -->
<button class="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
  + 새 일정
</button>

<!-- Secondary/Outline (예: "오늘", "이전", "다음") -->
<button class="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
  오늘
</button>

<!-- 텍스트 버튼 (예: "새로고침") -->
<button class="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
  ↻ 새로고침
</button>

<!-- 토글 그룹 – 선택됨 (예: 월/주/일 중 "월") -->
<button class="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white">월</button>
<!-- 토글 그룹 – 비선택 -->
<button class="rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">주</button>
```

### 5.2 상단 내비게이션 pill (활성 팀/사용자 표시)

```html
<span class="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
  MyApp 개발 팀1
</span>
```

`docs/8-wireframes.md` `WF-13` 상태 배지도 동일한 pill 형태를 재사용하되 색상만 상태별로 분기한다(§5.5 참조).

### 5.3 캘린더 그리드 (`WF-06`)

```html
<div class="grid grid-cols-7 border-t border-l border-gray-200">
  <!-- 요일 헤더 -->
  <div class="border-b border-r border-gray-200 py-2 text-center text-sm text-red-500">일</div>
  <div class="border-b border-r border-gray-200 py-2 text-center text-sm text-gray-700">월</div>
  <!-- ... 화~금 동일 패턴 text-gray-700 ... -->
  <div class="border-b border-r border-gray-200 py-2 text-center text-sm text-blue-500">토</div>

  <!-- 일반 날짜 셀 -->
  <div class="min-h-24 border-b border-r border-gray-200 p-1 text-sm text-gray-900">17</div>
  <!-- 오늘 날짜 셀 -->
  <div class="min-h-24 border-b border-r border-gray-200 bg-emerald-50 p-1 text-sm font-semibold text-gray-900">17</div>
  <!-- 인접 월(비활성) 날짜 셀 -->
  <div class="min-h-24 border-b border-r border-gray-200 bg-gray-50 p-1 text-sm text-gray-400">30</div>
</div>
```

일정 바(이벤트 블록, 셀 내부):

```html
<div class="mt-1 truncate rounded bg-emerald-500 px-1.5 py-0.5 text-xs text-white">
  스프린트 계획 회의
</div>
```

### 5.4 채팅 패널 (`WF-11`)

```html
<!-- 패널 컨테이너 -->
<aside class="flex h-full flex-col border-l border-gray-200">
  <header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
    <h2 class="text-base font-semibold text-gray-900">팀 채팅</h2>
    <span class="text-xs text-gray-500">팀원 2명</span>
  </header>

  <!-- 날짜 구분자 -->
  <div class="flex items-center justify-between px-4 py-2">
    <span class="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">10월 17일 (금)</span>
    <span class="flex items-center gap-1 text-xs text-emerald-600">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> 온라인
    </span>
  </div>

  <!-- 빈 상태 -->
  <div class="flex flex-1 flex-col items-center justify-center gap-2 text-gray-400">
    <div class="h-10 w-10 rounded-full bg-blue-500/80"></div>
    <p class="text-sm">아직 메시지가 없습니다</p>
    <p class="text-xs">첫 번째 메시지를 보내보세요!</p>
  </div>

  <!-- 입력 영역 -->
  <footer class="border-t border-gray-200 p-3">
    <div class="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
      <input
        class="flex-1 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        placeholder="메시지를 입력하세요..."
      />
      <button class="rounded-md bg-blue-600 p-1.5 text-white hover:bg-blue-700" aria-label="전송">
        ➤
      </button>
    </div>
    <div class="mt-1 flex justify-between text-xs text-gray-400">
      <span>Enter로 전송, Shift+Enter로 줄바꿈</span>
      <span>0/500</span>
    </div>
  </footer>
</aside>
```

일반 메시지 항목:

```html
<div class="px-4 py-2">
  <div class="flex items-baseline gap-2">
    <span class="text-sm font-medium text-gray-900">이서연</span>
    <span class="text-xs text-gray-400">09:40</span>
  </div>
  <p class="mt-0.5 text-sm text-gray-700">오늘 스프린트 계획 회의 자료 공유드립니다</p>
</div>
```

시스템 메시지(`WF-13`, BR-13):

```html
<div class="px-4 py-2 text-center text-xs text-gray-500">
  김팀장님이 이서연님의 요청을 승인했습니다.
</div>
```

### 5.5 일정 변경 요청 상태 배지 (`WF-13`)

배지는 §5.2의 pill 형태를 재사용하고 색상만 상태별로 분기한다. 액션 버튼(승인/거절/취소)의 노출 여부는 역할·상태 조합에 따르며(`BR-11`, `BR-12`), 클라이언트는 UX 편의로만 버튼을 숨기고 실제 권한 검증은 서버가 수행한다(`CLAUDE.md` 핵심 아키텍처 결정 참조 — 여기서는 시각 스타일만 규정한다).

| 상태 | 클래스 |
|---|---|
| 대기중 | `bg-amber-50 text-amber-700` |
| 승인됨 | `bg-emerald-50 text-emerald-700` |
| 거절됨(자동 포함) | `bg-red-50 text-red-600` |
| 취소됨 | `bg-gray-100 text-gray-500` |

```html
<span class="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">대기중</span>
```

## 6. Tailwind 설정 참고

커스텀 색상을 추가로 정의하지 않으므로 `tailwind.config.js`는 기본 팔레트를 그대로 사용하고, 다크 모드 전략만 명시한다.

```js
// tailwind.config.js
export default {
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

## 7. 적용하지 않는 것

다음은 스크린샷이나 문서 근거가 없어 본 가이드에 포함하지 않는다(오버엔지니어링 금지 원칙).

- 별도 컴포넌트 라이브러리(shadcn/ui 등) 도입 — 순수 Tailwind 유틸리티 클래스만 사용
- 커스텀 컬러 토큰/디자인 시스템 빌드 도구(Style Dictionary 등)
- 다크 모드 수동 토글 UI — 시스템 설정(`prefers-color-scheme`) 자동 대응만 지원
- 애니메이션/트랜지션 라이브러리 — 필요 시 Tailwind 기본 `transition-colors` 정도만 사용
