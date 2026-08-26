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
