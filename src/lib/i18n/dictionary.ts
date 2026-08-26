import type { Locale } from './locale';

/**
 * 번역 사전.
 *
 * 키는 평면 문자열(`'login.email'`)이다. 중첩 객체를 쓰지 않는 이유는 타입이 단순해지고,
 * 빠진 키를 `Record<MessageKey, string>` 만으로 컴파일 타임에 잡을 수 있기 때문이다.
 * `ko` 가 키 집합의 기준이고, 다른 로케일은 같은 키를 모두 채워야 한다.
 */
const ko = {
  // 공통
  'common.cancel': '취소',
  'common.confirm': '확인',
  'common.save': '저장',
  'common.close': '닫기',
  'common.loading': '불러오는 중',

  // 언어 전환
  'locale.switch': '언어 변경',
  'locale.current': '현재 언어: {name}',

  // 로그인
  'login.email': '이메일',
  'login.emailPlaceholder': 'you@company.com',
  'login.requestCode': '인증 코드 받기',
  'login.codeSent': '인증 코드가 전송되었습니다',
  'login.requestFailed': '요청 실패',
  'login.loginFailed': '로그인 실패',
  'login.sentTo': '받는 이메일',
  'login.change': '변경',
  'login.code': '인증 코드',
  'login.submit': '로그인',
  'login.resend': '코드 재전송',
  'login.resendIn': '{seconds}초 후 재전송',
  'login.tagline': 'Slack으로 로그인합니다',
  'login.cardTitle': '로그인',
  'login.cardDescription': '이메일을 입력하면 Slack DM으로 6자리 인증 코드가 발송됩니다.',
  'login.devNoSlack': 'dev 모드: Slack 토큰 미설정 — 서버 콘솔에 OTP가 출력됩니다',

  // 기간 표기 — 화면 곳곳에서 재사용한다.
  'duration.hm': '{h}시간 {m}분',
  'duration.h': '{h}시간',
  'duration.m': '{m}분',
  'duration.days': '{days}일',

  // 근태 상태
  'status.working': '근무 중',
  'status.onMeal': '식사 중',
  'status.onBreak': '자리비움',
  'status.done': '퇴근 완료',
  'status.missing': '근태 누락',
  'status.notStarted': '출근 전',
  'status.inProgress': '진행 중',
  'status.complete': '완료',
  'status.pending': '대기',
  'status.approved': '승인',

  // 근태 버튼
  'attendance.clockIn': '출근',
  'attendance.clockOut': '퇴근',
  'attendance.meal': '식사',
  'attendance.away': '자리비움',
  'attendance.back': '복귀',
  'attendance.requestFailed': '요청 실패',
  'attendance.clockedIn': '출근 처리되었습니다',
  'attendance.clockedOut': '퇴근 처리되었습니다',
  'attendance.mealStarted': '식사 처리되었습니다',
  'attendance.awayStarted': '자리비움 처리되었습니다',
  'attendance.backDone': '복귀 처리되었습니다',
  'attendance.blockedByMeal': '식사 중에는 퇴근할 수 없습니다. {minutes}분 뒤 자동 복귀됩니다.',
  'attendance.blockedByBreak': '자리비움 중에는 퇴근할 수 없습니다. 복귀 후 퇴근해주세요.',
  'attendance.mealAutoBack': '{minutes}분 뒤 자동 복귀가 됩니다.',
  'attendance.unavailableDuringMeal': '식사 중에는 사용할 수 없습니다. {minutes}분 뒤 자동 복귀됩니다.',
  'attendance.awayFor': '{duration} 자리비움',
  'attendance.mealFor': '{duration} 식사 중',
  'attendance.daysWorked': '{days}일 근무',

  // 대시보드
  'dashboard.greeting': '안녕하세요, {name}님',
  'dashboard.today': '오늘의 근태',
  'dashboard.workTime': '근무 시간',
  'dashboard.thisWeek': '이번 주 근무',
  'dashboard.thisMonth': '이번 달 근무',
  'dashboard.noRecord': '기록 없음',
  'dashboard.leaveRemaining': '연차 잔여',
  'dashboard.leaveBreakdown': '기본 {base} · 추가 {bonus} · 예정 {scheduled} · 사용 {consumed}',
  'dashboard.leavePending': ' · 대기 {pending}',

  // 연차 신청
  'leave.request': '연차 신청',
  'leave.requestHalf': '반차 신청',
  'leave.fullDay': '종일',
  'leave.am': '오전',
  'leave.pm': '오후',
  'leave.amHalf': '오전 반차',
  'leave.pmHalf': '오후 반차',
  'leave.pickDate': '날짜 선택',
  'leave.date': '날짜',
  'leave.startDate': '시작일',
  'leave.endDate': '종료일',
  'leave.submitted': '연차가 신청되었습니다',
  'leave.available': '사용 가능 연차',
  'leave.requesting': '신청',
  'leave.dayUnit': '일',
  'leave.errEndRequired': '종료일을 선택해 주세요',
  'leave.errStartRequired': '시작일을 선택해 주세요',
  'leave.errExceeds': '사용 가능 연차를 초과했습니다',
  'leave.errInvalidRange': '종료일이 시작일보다 빠릅니다',
  'leave.errPast': '과거 날짜는 신청할 수 없습니다',
  'leave.errStartHoliday': '시작일은 주말·공휴일로 지정할 수 없습니다',
  'leave.errHalfOnHoliday': '주말·공휴일에는 반차를 신청할 수 없습니다',
  'leave.errEndHoliday': '종료일은 주말·공휴일로 지정할 수 없습니다',

  // 연차 취소
  'leave.myRequests': '내 신청 내역',
  'leave.cancellable': '취소 가능한 연차',
  'leave.noCancellable': '취소 가능한 신청이 없습니다',
  'leave.cancel': '취소',
  'leave.cancelTitle': '연차 신청 취소',
  'leave.cancelApprovedConfirm': '승인된 연차를 취소하면 사용한 잔여가 환원됩니다. 진행할까요?',
  'leave.cancelConfirm': '신청을 취소하시겠습니까?',
  'leave.cancelBack': '돌아가기',
  'leave.cancelDo': '취소하기',
  'leave.cancelling': '처리 중…',
  'leave.cancelFailed': '취소 실패',
  'leave.cancelled': '취소되었습니다',

  // Slack 슬래시 커맨드 응답. 이모지는 로케일과 무관하게 유지한다.
  'slack.noUser': '요청에 사용자 정보가 없어요',
  'slack.noAccount': 'offon에 연결된 계정이 없어요. 관리자에게 문의해주세요.',
  'slack.alreadyWorking': '이미 근무중입니다💻',
  'slack.clockOutWhileAway': '자리비움 상태입니다. 복귀 후 퇴근해주세요🙏',
  'slack.clockOutWhileMeal': '식사 중입니다. 식사 종료 후 퇴근해주세요🍽️',
  'slack.noClockIn': '출근 기록이 없습니다⚠️',
  'slack.alreadyOnMeal': '이미 식사 중입니다🍽️',
  'slack.blockedWhileAway': '자리비움 중에는 사용할 수 없습니다⏸️',
  'slack.alreadyDone': '오늘 근무가 이미 종료되었습니다🌙',
  'slack.clockInFirst': '출근 후 사용해주세요☀️',
  'slack.blockedWhileMeal': '식사 중에는 사용할 수 없습니다🍽️',
  'slack.alreadyAway': '이미 자리비움 상태입니다⏸️',
  'slack.mealAutoReturn': '식사 복귀는 자동으로 1시간 뒤에 진행됩니다🍽️',
  'slack.notAway': '자리비움 상태가 아닙니다⚠️',
  'slack.unknownCommand': '지원하지 않는 명령이에요',

  // Slack 채널 공지. {time} 은 이미 포맷된 시각, {name} 은 멤버 이름.
  'announce.clockIn': '{time}\n{name}님이 출근하셨습니다☀️',
  'announce.clockOut': '{time}\n{name}님이 퇴근하셨습니다🌙',
  'announce.meal': '{time}\n{name}님이 식사하러 가셨습니다🍽️',
  'announce.away': '{time}\n{name}님이 자리를 비웠습니다⏸️',
  'announce.back': '{time}\n{name}님이 복귀했습니다▶️',

  // 근태 도메인 거절 사유. 도메인은 키만 반환하고, 화면은 보는 사람의 언어로,
  // Slack 은 배포 언어로 각자 번역한다.
  'attErr.alreadyWorking': '이미 근무 중입니다',
  'attErr.awayUseBack': '자리비움 상태입니다. 복귀를 사용해주세요',
  'attErr.awayBeforeClockOut': '자리비움 상태입니다. 복귀 후 퇴근해주세요',
  'attErr.mealBeforeClockOut': '식사 중입니다. 식사 종료 후 퇴근해주세요',
  'attErr.noOpenSession': '진행 중인 근무 세션이 없습니다',
  'attErr.clockInFirst': '출근 후 사용해주세요',
  'attErr.alreadyDone': '오늘 근무가 이미 종료되었습니다',
  'attErr.alreadyAway': '이미 자리비움 상태입니다',
  'attErr.blockedWhileMeal': '식사 중에는 사용할 수 없습니다',
  'attErr.alreadyOnMeal': '이미 식사 중입니다',
  'attErr.blockedWhileAway': '자리비움 중에는 사용할 수 없습니다',
  'attErr.notAway': '자리비움 상태가 아닙니다',
} as const;

export type MessageKey = keyof typeof ko;

export type Messages = Record<MessageKey, string>;

const en: Messages = {
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.save': 'Save',
  'common.close': 'Close',
  'common.loading': 'Loading',

  'locale.switch': 'Change language',
  'locale.current': 'Current language: {name}',

  'login.email': 'Email',
  'login.emailPlaceholder': 'you@company.com',
  'login.requestCode': 'Send me a code',
  'login.codeSent': 'Code sent to your Slack DM',
  'login.requestFailed': 'Request failed',
  'login.loginFailed': "Couldn't sign you in",
  'login.sentTo': 'Sent to',
  'login.change': 'Change',
  'login.code': 'Verification code',
  'login.submit': 'Sign in',
  'login.resend': 'Resend code',
  'login.resendIn': 'Resend in {seconds}s',
  'login.tagline': 'Sign in with Slack',
  'login.cardTitle': 'Sign in',
  'login.cardDescription':
    'Enter your email and a 6-digit code will arrive in your Slack DMs.',
  'login.devNoSlack': 'dev mode: no Slack token — the code is printed to the server console',

  'duration.hm': '{h}h {m}m',
  'duration.h': '{h}h',
  'duration.m': '{m}m',
  'duration.days': '{days}d',

  'status.working': 'Working',
  'status.onMeal': 'On meal',
  'status.onBreak': 'Away',
  'status.done': 'Clocked out',
  'status.missing': 'Missing',
  'status.notStarted': 'Not started',
  'status.inProgress': 'In progress',
  'status.complete': 'Done',
  'status.pending': 'Pending',
  'status.approved': 'Approved',

  'attendance.clockIn': 'Clock in',
  'attendance.clockOut': 'Clock out',
  'attendance.meal': 'Meal',
  'attendance.away': 'Away',
  'attendance.back': 'Back',
  'attendance.requestFailed': 'Request failed',
  'attendance.clockedIn': "You're clocked in",
  'attendance.clockedOut': "You're clocked out",
  'attendance.mealStarted': 'Meal started',
  'attendance.awayStarted': 'Marked away',
  'attendance.backDone': 'Welcome back',
  'attendance.blockedByMeal': "You can't clock out during a meal. You'll be back automatically in {minutes} min.",
  'attendance.blockedByBreak': "You can't clock out while away. Come back first.",
  'attendance.mealAutoBack': "You'll be back automatically in {minutes} min.",
  'attendance.unavailableDuringMeal': "Not available during a meal. You'll be back automatically in {minutes} min.",
  'attendance.awayFor': 'Away {duration}',
  'attendance.mealFor': 'On meal {duration}',
  'attendance.daysWorked': '{days} days worked',

  'dashboard.greeting': 'Hello, {name}',
  'dashboard.today': "Today's attendance",
  'dashboard.workTime': 'Worked',
  'dashboard.thisWeek': 'This week',
  'dashboard.thisMonth': 'This month',
  'dashboard.noRecord': 'No records',
  'dashboard.leaveRemaining': 'Leave remaining',
  'dashboard.leaveBreakdown': 'Base {base} · Bonus {bonus} · Scheduled {scheduled} · Used {consumed}',
  'dashboard.leavePending': ' · Pending {pending}',

  'leave.request': 'Request leave',
  'leave.requestHalf': 'Request half day',
  'leave.fullDay': 'Full day',
  'leave.am': 'Morning',
  'leave.pm': 'Afternoon',
  'leave.amHalf': 'Morning half day',
  'leave.pmHalf': 'Afternoon half day',
  'leave.pickDate': 'Pick a date',
  'leave.date': 'Date',
  'leave.startDate': 'Start date',
  'leave.endDate': 'End date',
  'leave.submitted': 'Leave requested',
  'leave.available': 'Available',
  'leave.requesting': 'Requesting',
  'leave.dayUnit': 'd',
  'leave.errEndRequired': 'Pick an end date',
  'leave.errStartRequired': 'Pick a start date',
  'leave.errExceeds': 'That exceeds your available leave',
  'leave.errInvalidRange': 'The end date is before the start date',
  'leave.errPast': "You can't request leave in the past",
  'leave.errStartHoliday': "The start date can't be a weekend or holiday",
  'leave.errHalfOnHoliday': "You can't take a half day on a weekend or holiday",
  'leave.errEndHoliday': "The end date can't be a weekend or holiday",

  'leave.myRequests': 'My requests',
  'leave.cancellable': 'Leave you can cancel',
  'leave.noCancellable': 'Nothing to cancel',
  'leave.cancel': 'Cancel',
  'leave.cancelTitle': 'Cancel leave request',
  'leave.cancelApprovedConfirm': 'Cancelling approved leave returns the days to your balance. Continue?',
  'leave.cancelConfirm': 'Cancel this request?',
  'leave.cancelBack': 'Go back',
  'leave.cancelDo': 'Cancel it',
  'leave.cancelling': 'Working…',
  'leave.cancelFailed': "Couldn't cancel",
  'leave.cancelled': 'Cancelled',

  'slack.noUser': "The request didn't include who you are",
  'slack.noAccount': 'No offon account is linked to you. Ask your admin to add you.',
  'slack.alreadyWorking': "You're already clocked in💻",
  'slack.clockOutWhileAway': "You're away. Come back before clocking out🙏",
  'slack.clockOutWhileMeal': "You're on a meal. Clock out once it ends🍽️",
  'slack.noClockIn': "You haven't clocked in today⚠️",
  'slack.alreadyOnMeal': "You're already on a meal🍽️",
  'slack.blockedWhileAway': "You can't use that while away⏸️",
  'slack.alreadyDone': "You've already finished for today🌙",
  'slack.clockInFirst': 'Clock in first☀️',
  'slack.blockedWhileMeal': "You can't use that during a meal🍽️",
  'slack.alreadyAway': "You're already away⏸️",
  'slack.mealAutoReturn': "You'll be back automatically an hour after the meal starts🍽️",
  'slack.notAway': "You're not away right now⚠️",
  'slack.unknownCommand': "That command isn't supported",

  'announce.clockIn': '{time}\n{name} clocked in☀️',
  'announce.clockOut': '{time}\n{name} clocked out🌙',
  'announce.meal': '{time}\n{name} went for a meal🍽️',
  'announce.away': '{time}\n{name} stepped away⏸️',
  'announce.back': '{time}\n{name} is back▶️',

  'attErr.alreadyWorking': "You're already clocked in",
  'attErr.awayUseBack': "You're away — use back instead",
  'attErr.awayBeforeClockOut': "You're away. Come back before clocking out",
  'attErr.mealBeforeClockOut': "You're on a meal. Clock out once it ends",
  'attErr.noOpenSession': 'No work session is open',
  'attErr.clockInFirst': 'Clock in first',
  'attErr.alreadyDone': "You've already finished for today",
  'attErr.alreadyAway': "You're already away",
  'attErr.blockedWhileMeal': "You can't use that during a meal",
  'attErr.alreadyOnMeal': "You're already on a meal",
  'attErr.blockedWhileAway': "You can't use that while away",
  'attErr.notAway': "You're not away right now",
};

export const MESSAGES: Record<Locale, Messages> = { ko, en };

/**
 * 키를 문자열로 바꾸고 `{name}` 자리표시자를 채운다.
 * 없는 키는 키 자체를 돌려준다 — 화면이 비는 것보다 무엇이 빠졌는지 보이는 편이 낫다.
 */
export function translate(
  messages: Messages,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = messages[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}
