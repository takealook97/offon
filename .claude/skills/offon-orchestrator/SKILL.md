---
name: offon-orchestrator
description: offon 근태/연차 MVP에서 기능 구현·수정·보완·다시 실행 요청이 들어오면 반드시 이 스킬을 사용한다. 근태, 연차, 캘린더, 멤버 관리, Slack OTP 로그인, 관리자 기능, Cron 누락 알림, 감사 로그, 대시보드 관련 모든 작업을 3인 팀(backend-implementer / frontend-implementer / qa-verifier)으로 조율한다. "근태 추가", "연차 승인 버그", "OTP 다시 구현", "캘린더 수정", "관리자 페이지 개선" 같은 요청에 즉시 트리거.
---

# offon Orchestrator

offon 프로젝트의 에이전트 팀 리더. `TeamCreate`로 팀을 구성하고 `TaskCreate`로 작업을 할당하며, 팀원 간 `SendMessage` 직접 통신으로 자체 조율한다. 리더는 진행 상황만 모니터링하고 최종 결과를 종합한다.

## Phase 0: 컨텍스트 확인 (초기/후속/부분 재실행 판별)

작업 시작 전 `_workspace/` 상태를 확인한다:
- **미존재** → 초기 실행. 새 팀 구성.
- **존재 + 사용자가 부분 수정 요청** (예: "연차 승인 버그만") → 부분 재실행. 해당 모듈의 `be_*.md` / `fe_*.md`만 재호출.
- **존재 + 새 기능 요청** → `_workspace/`를 `_workspace_prev/`로 이동 후 새 실행.

## Phase 1: 도메인 확인
- 요청이 근태(A), 연차(B), 캘린더(C), 멤버(D), 인증(E), Cron/알림(F), 감사(G) 중 어느 그룹인지 분류.
- `/Users/takealook/.claude/plans/` 중 offon 계획서 참조 (파일명에 "lukuku-app" 포함).
- 기존 `src/` 구조와 Prisma 스키마를 읽어 변경 영향 범위 파악.

## Phase 2: 팀 구성 & 작업 할당
1. `TeamCreate` — 팀원: `backend-implementer`, `frontend-implementer`, `qa-verifier`. 모두 `model: opus`.
2. `TaskCreate`로 세분화된 작업 등록:
   - 백엔드 작업 (Route Handler, Server Action, Prisma)
   - 프론트엔드 작업 (page/component)
   - QA 작업 (해당 모듈 교차검증) — `addBlockedBy`로 be/fe 완료에 의존.
3. 리더는 각 작업의 `owner` 세팅. 작업 간 의존성은 `addBlocks` / `addBlockedBy`로 연결.

## Phase 3: 자체 조율 모니터링
- 팀원들은 `SendMessage`로 서로 경계 변경·질문 교환.
- 리더는 `TaskList`로 진행 상황 관찰. 블로커 감지 시 개입.
- 산출물은 `_workspace/`에 파일 기반 기록 (`be_*_done.md`, `fe_*_done.md`, `qa_*.md`).

## Phase 4: 결과 종합 & 팀 정리
- 전 작업 `completed` 확인.
- QA 보고서 blocker/major 이슈 0건 확인. 있으면 구현자에게 재할당.
- 최종 변경 요약을 사용자에게 보고.
- `TeamDelete`로 팀 해체.
- Phase 간 팀 재구성이 필요한 경우(대규모 리팩터)만 새 팀을 다시 만든다.

## 데이터 전달 프로토콜

| 전략 | 용도 |
|------|------|
| `TaskCreate` / `TaskUpdate` | 작업 상태 추적, 의존성 관리 |
| `SendMessage` | 실시간 경계 동기화(응답 shape 변경, 질문) |
| 파일 (`_workspace/*.md`) | 산출물 기록 (완료 신호 + 변경 파일 목록 + 경계 요약) |

파일명 규약: `_workspace/{phase}_{agent}_{module}.md`. 예: `_workspace/be_attendance_done.md`, `_workspace/qa_leave_approve.md`.

## 에러 핸들링
- 구현자 1회 재시도 후 재실패 → 해당 모듈 건너뛰고 최종 보고에 명시.
- 타입/빌드 에러는 즉시 구현자에게 `SendMessage`로 반환, 블로커로 태그.
- QA 이슈 blocker/major는 구현자에게 직접 패스, minor는 보고서에만 기록.

## 팀 크기
- 기본 3인 (backend + frontend + qa) 고정. 팀 크기는 조정하지 않는다(MVP 범위 내).
- 작업이 20개 초과하면 Phase 단위로 쪼개 순차 실행.

## 테스트 시나리오

### 정상 흐름: 연차 신청 페이지 추가
1. 리더: "연차 신청 화면과 API 추가" 요청 수신.
2. Phase 0: `_workspace/` 없음 → 초기 실행.
3. Phase 1: 그룹 B(연차).
4. Phase 2: `TeamCreate` + 3개 Task 등록(be: API, fe: page, qa: 경계 검증 — qa는 be/fe에 `blockedBy`).
5. Phase 3: be가 `/api/leave/request` 구현 후 `_workspace/be_leave_done.md`에 응답 shape 공지. fe가 이를 읽고 폼 구현. qa가 양쪽 비교 후 통과.
6. Phase 4: 사용자에게 요약 보고 → 팀 정리.

### 에러 흐름: 스키마 충돌
1. be가 `LeaveRequest`에 `reason` 필드 추가하려 함.
2. 리더에게 `SendMessage`로 스키마 변경 승인 요청.
3. 리더는 계획서 확인 후 승인. be가 마이그레이션 실행.
4. qa는 응답 필드 추가 감지 → fe에게 `reason` 수신 추가 요청 핑. fe 수정 후 통과.

## 후속 작업 지원
- "이전처럼 다시 해줘", "이 부분만 수정해줘", "연차 승인 로직 보완" 같은 후속 요청 시 Phase 0에서 재실행 모드 판별.
- 에이전트 정의에 "이전 산출물이 있을 때" 섹션이 있으므로, 해당 지침을 따른다.
