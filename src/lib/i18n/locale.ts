/**
 * 지원 로케일과 쿠키 규약.
 *
 * 서버 컴포넌트는 `cookies()` 에서, 클라이언트는 `document.cookie` 에서 같은 키를 읽는다.
 * 세션 쿠키와 달리 서명하지 않는다 — 표시 언어일 뿐 권한과 무관하고, 값이 깨져도
 * `DEFAULT_LOCALE` 로 떨어지면 그만이기 때문이다.
 */
export const LOCALES = ['ko', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ko';

export const LOCALE_COOKIE = 'locale';

/** 쿠키·헤더에서 온 임의의 문자열을 지원 로케일로 좁힌다. 모르는 값은 기본값. */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;
  const lower = value.toLowerCase();
  const exact = LOCALES.find((locale) => locale === lower);
  if (exact) return exact;
  // 'en-US', 'ko-KR' 처럼 지역이 붙은 값도 받아준다.
  const base = lower.split('-')[0];
  return LOCALES.find((locale) => locale === base) ?? DEFAULT_LOCALE;
}

/** 사람이 읽는 언어 이름. 각 언어를 그 언어로 적어 전환 메뉴에서 바로 알아보게 한다. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
};
