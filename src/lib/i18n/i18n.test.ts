import test from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, translate, type MessageKey } from './dictionary';
import { DEFAULT_LOCALE, LOCALES, normalizeLocale } from './locale';

test('every locale defines the same keys', () => {
  // A key present in only one locale leaves the other language with a blank, or the raw key on screen.
  const reference = Object.keys(MESSAGES[DEFAULT_LOCALE]).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(
      Object.keys(MESSAGES[locale]).sort(),
      reference,
      `locale "${locale}" does not define the same keys as "${DEFAULT_LOCALE}"`,
    );
  }
});

test('no message is left empty', () => {
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(MESSAGES[locale])) {
      assert.ok(value.trim().length > 0, `"${key}" is empty in locale "${locale}"`);
    }
  }
});

test('placeholders match across locales', () => {
  // A placeholder used in only one language means the number disappears in the other.
  const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
  for (const key of Object.keys(MESSAGES[DEFAULT_LOCALE]) as MessageKey[]) {
    const expected = placeholders(MESSAGES[DEFAULT_LOCALE][key]);
    for (const locale of LOCALES) {
      assert.equal(
        placeholders(MESSAGES[locale][key]),
        expected,
        `"${key}" has different placeholders in "${locale}"`,
      );
    }
  }
});

test('normalizes a plain locale code', () => {
  assert.equal(normalizeLocale('ko'), 'ko');
  assert.equal(normalizeLocale('en'), 'en');
});

test('normalizes a region-tagged code to its base language', () => {
  assert.equal(normalizeLocale('en-US'), 'en');
  assert.equal(normalizeLocale('ko-KR'), 'ko');
  assert.equal(normalizeLocale('EN'), 'en');
});

test('falls back to the default for unknown or missing values', () => {
  assert.equal(normalizeLocale(null), DEFAULT_LOCALE);
  assert.equal(normalizeLocale(undefined), DEFAULT_LOCALE);
  assert.equal(normalizeLocale(''), DEFAULT_LOCALE);
  assert.equal(normalizeLocale('fr'), DEFAULT_LOCALE);
  assert.equal(normalizeLocale('../../etc/passwd'), DEFAULT_LOCALE);
});

test('substitutes placeholders', () => {
  assert.equal(translate(MESSAGES.en, 'login.resendIn', { seconds: 30 }), 'Resend in 30s');
  assert.equal(translate(MESSAGES.ko, 'login.resendIn', { seconds: 30 }), '30초 후 재전송');
});

test('leaves an unsupplied placeholder visible rather than printing undefined', () => {
  assert.equal(translate(MESSAGES.en, 'login.resendIn'), 'Resend in {seconds}s');
  assert.equal(translate(MESSAGES.en, 'login.resendIn', {}), 'Resend in {seconds}s');
});

test('returns a plain message untouched', () => {
  assert.equal(translate(MESSAGES.en, 'login.submit'), 'Sign in');
  assert.equal(translate(MESSAGES.ko, 'login.submit'), '로그인');
});

test('deployment locale comes from DEFAULT_LOCALE and falls back safely', async () => {
  const { getDeploymentLocale, getDeploymentT } = await import('./deployment');
  const previous = process.env.DEFAULT_LOCALE;
  try {
    process.env.DEFAULT_LOCALE = 'en';
    assert.equal(getDeploymentLocale(), 'en');
    assert.equal(getDeploymentT()('slack.clockInFirst'), 'Clock in first☀️');

    process.env.DEFAULT_LOCALE = 'ko';
    assert.equal(getDeploymentLocale(), 'ko');

    // A typo or an unsupported language must not send a Slack reply consisting of a raw key.
    process.env.DEFAULT_LOCALE = 'de';
    assert.equal(getDeploymentLocale(), DEFAULT_LOCALE);

    delete process.env.DEFAULT_LOCALE;
    assert.equal(getDeploymentLocale(), DEFAULT_LOCALE);
  } finally {
    if (previous === undefined) delete process.env.DEFAULT_LOCALE;
    else process.env.DEFAULT_LOCALE = previous;
  }
});
