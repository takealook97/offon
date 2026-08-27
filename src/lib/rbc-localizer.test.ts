import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_OPTS, calendarFormats, calendarMessages } from './rbc-localizer';
import { MESSAGES, translate, type MessageKey } from './i18n/dictionary';

/**
 * How the calendar writes dates. Both the attendance month view and the meeting-room week grid
 * use these, so a change here moves two screens at once.
 *
 * The dates below are constructed in local time on purpose: that is what react-big-calendar
 * hands these formatters, and formatting them as anything else is how a grid ends up labelled
 * a day out.
 */

const t = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(MESSAGES.en, key, vars);

/** 2026-06-01 was a Monday. Built in local time, as the calendar builds its cells. */
const monday = new Date(2026, 5, 1, 9, 5);
const friday = new Date(2026, 5, 5, 17, 30);

test('weeks start on Sunday', () => {
  // The grid and the weekly summary have to agree, or a Sunday lands in the wrong total.
  assert.equal(WEEK_OPTS.weekStartsOn, 0);
});

test('the month header is the year and month alone', () => {
  // Act
  const header = calendarFormats('en').monthHeaderFormat(monday);

  // Assert
  assert.equal(header, '2026-06');
});

test('a day header names the date and the weekday it fell on', () => {
  // Act
  const header = calendarFormats('en').dayHeaderFormat(monday);

  // Assert
  assert.equal(header, '2026-06-01 (Monday)');
});

test('a day cell is the day number and its short weekday', () => {
  // Act
  const label = calendarFormats('en').dayFormat(monday);

  // Assert
  assert.equal(label, '1 (Mon)');
});

test('times are written on a 24-hour clock, zero-padded', () => {
  // Arrange: a 12-hour clock in the gutter makes an evening booking ambiguous.
  const formats = calendarFormats('en');

  // Act + Assert
  assert.equal(formats.timeGutterFormat(monday), '09:05');
  assert.equal(formats.timeGutterFormat(friday), '17:30');
});

test('an event reads as a range on the same clock', () => {
  // Act
  const range = calendarFormats('en').eventTimeRangeFormat({ start: monday, end: friday });

  // Assert
  assert.equal(range, '09:05 ~ 17:30');
});

test('a week header names the span from its first day to the last', () => {
  // Act
  const header = calendarFormats('en').dayRangeHeaderFormat({ start: monday, end: friday });

  // Assert
  assert.equal(header, '2026-06-01 – 05');
});

test('the weekday names follow the chosen language', () => {
  // Arrange: the format strings are shared, only the locale differs.
  // Act
  const en = calendarFormats('en').weekdayFormat(monday);
  const ko = calendarFormats('ko').weekdayFormat(monday);

  // Assert
  assert.equal(en, 'Mon');
  assert.notEqual(ko, en, 'the Korean calendar must not be labelled in English');
});

test('the numbers do not change with the language, only the words', () => {
  // Act
  const enHeader = calendarFormats('en').monthHeaderFormat(monday);
  const koHeader = calendarFormats('ko').monthHeaderFormat(monday);

  // Assert
  assert.equal(enHeader, koHeader, 'yyyy-MM is the same in both');
  assert.equal(calendarFormats('ko').timeGutterFormat(friday), '17:30');
});

test('every label the calendar needs is supplied and translated', () => {
  // Arrange: react-big-calendar uses these internally even where the buttons are hidden,
  // and a missing one renders as its English default in the middle of a Korean screen.
  const expected = [
    'month', 'week', 'day', 'today', 'previous',
    'next', 'agenda', 'date', 'time', 'event', 'noEventsInRange',
  ];

  // Act
  const messages = calendarMessages(t);

  // Assert
  assert.deepEqual(Object.keys(messages).sort(), [...expected].sort());
  for (const [key, value] of Object.entries(messages)) {
    assert.ok(typeof value === 'string' && value.length > 0, `${key} is empty`);
    assert.ok(!value.includes('.'), `${key} looks like an untranslated key: ${value}`);
  }
});
