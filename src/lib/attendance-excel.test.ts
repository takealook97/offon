import test from 'node:test';
import assert from 'node:assert/strict';
import { Workbook } from 'exceljs';
import { formatHM, buildIndividualWorkbook, buildOrgWorkbook } from './attendance-excel';
import type { IndividualReport, OrgReport, DailyRow, ReportSummary } from './attendance-export';
import { MESSAGES, translate, type MessageKey } from './i18n/dictionary';

/**
 * The file an accountant opens. The workbook is built and then read back with exceljs, because
 * what matters is what ended up in the cells — a formatter that silently drops a minus sign or
 * a column that shifts by one is invisible to any assertion made on the report object.
 */

const t = (key: MessageKey, vars?: Record<string, string | number>) =>
  translate(MESSAGES.en, key, vars);

const summary = (over: Partial<ReportSummary> = {}): ReportSummary => ({
  baselineMinutes: 9600,
  weekdaySumMinutes: 9700,
  overtimeMinutes: 100,
  holidaySumMinutes: 0,
  totalSumMinutes: 9700,
  ...over,
});

const row = (over: Partial<DailyRow> = {}): DailyRow => ({
  date: '2026.06.01 (Mon)',
  workMinutes: 480,
  breakMinutes: 30,
  isHoliday: false,
  leaveLabel: '',
  sumMinutes: 450,
  ...over,
});

const individualReport = (over: Partial<IndividualReport> = {}): IndividualReport => ({
  member: { id: 1, name: 'Ada Lovelace', position: 'Engineer' },
  yyyymm: '202606',
  rows: [row()],
  summary: summary(),
  ...over,
});

/** Every non-empty cell value in a sheet, as strings, so a value can be located without
 *  hard-coding the layout the template happens to use today. */
async function cellsOf(buffer: Uint8Array, sheetIndex = 0): Promise<string[]> {
  const wb = new Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ArrayBuffer);
  const ws = wb.worksheets[sheetIndex];
  const out: string[] = [];
  ws.eachRow((r) => {
    r.eachCell((cell) => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        out.push(String(cell.value));
      }
    });
  });
  return out;
}

test('formatHM always writes hours and minutes, zeros included', () => {
  // Act + Assert
  assert.equal(formatHM(t, 0), t('duration.hm', { h: 0, m: 0 }));
  assert.equal(formatHM(t, 60), t('duration.hm', { h: 1, m: 0 }));
  assert.equal(formatHM(t, 5), t('duration.hm', { h: 0, m: 5 }));
});

test('formatHM splits minutes into hours and remainder', () => {
  // Act + Assert
  assert.equal(formatHM(t, 545), t('duration.hm', { h: 9, m: 5 }));
});

test('formatHM puts the sign in front of the whole value, not inside it', () => {
  // Arrange: being short is the common case in this column, so the minus has to survive.
  // Act
  const negative = formatHM(t, -90);

  // Assert
  assert.ok(negative.startsWith('-'), `expected a leading minus, got ${negative}`);
  assert.equal(negative, `-${formatHM(t, 90)}`);
  assert.ok(!negative.slice(1).includes('-'), 'only one minus, at the front');
});

test('formatHM does not write a minus for zero', () => {
  // Act + Assert
  assert.ok(!formatHM(t, 0).startsWith('-'));
});

test('the personal sheet leads with its columns, in order', async () => {
  // Arrange: whose sheet it is and which month lives in the filename the route sets, not in
  // the workbook. What the workbook owes is the table, and a column shifting by one would put
  // break time under the away heading with nothing looking wrong.
  const expected = [
    t('xls.date'),
    t('xls.workTime'),
    t('xls.awayTime'),
    t('xls.isHoliday'),
    t('xls.leave'),
    t('xls.total'),
  ];

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, individualReport()));

  // Assert
  assert.deepEqual(cells.slice(0, expected.length), expected);
});

test('a row lines up under the headings it belongs to', async () => {
  // Arrange: every column is given a value, so the whole row can be compared position by
  // position. A column shifting by one would put break time under the away heading with
  // nothing about the file looking wrong.
  const only = row({
    date: '2026.06.02 (Tue)',
    workMinutes: 480,
    breakMinutes: 30,
    isHoliday: true,
    leaveLabel: 'leave.amHalf',
    sumMinutes: 450,
  });

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, individualReport({ rows: [only] })));

  // Assert: the six headings, then the six values of the single day, in the same order.
  assert.deepEqual(cells.slice(6, 12), [
    '2026.06.02 (Tue)',
    formatHM(t, 480),
    formatHM(t, 30),
    'Y',
    t('leave.amHalf'),
    formatHM(t, 450),
  ]);
});

test('a day with no leave leaves that cell empty rather than writing something', async () => {
  // Arrange
  const only = row({ leaveLabel: '', isHoliday: false });

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, individualReport({ rows: [only] })));

  // Assert: five values, not six — the leave cell is genuinely blank.
  assert.deepEqual(cells.slice(6, 11), [
    only.date,
    formatHM(t, only.workMinutes),
    formatHM(t, only.breakMinutes),
    'N',
    formatHM(t, only.sumMinutes),
  ]);
});

test('every day in the report becomes a row in the sheet', async () => {
  // Arrange
  const rows = [
    row({ date: '2026.06.01 (Mon)' }),
    row({ date: '2026.06.02 (Tue)' }),
    row({ date: '2026.06.03 (Wed)' }),
  ];

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, individualReport({ rows })));

  // Assert
  for (const r of rows) {
    assert.ok(cells.includes(r.date), `${r.date} is missing from the sheet`);
  }
});

test('a leave day is labelled in the sheet, not left blank', async () => {
  // Arrange
  const rows = [row({ leaveLabel: 'appr.leave', workMinutes: 0, sumMinutes: 480 })];

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, individualReport({ rows })));

  // Assert
  assert.ok(
    cells.includes(t('appr.leave')),
    'the leave label must be translated into the sheet',
  );
});

test('negative overtime reaches the sheet with its sign', async () => {
  // Arrange: the summary an under-worked month produces.
  const report = individualReport({
    summary: summary({ overtimeMinutes: -125, weekdaySumMinutes: 9475 }),
  });

  // Act
  const cells = await cellsOf(await buildIndividualWorkbook(t, report));

  // Assert
  assert.ok(
    cells.includes(formatHM(t, -125)),
    `expected ${formatHM(t, -125)} among ${cells.join(' | ')}`,
  );
});

test('the org sheet carries one row per person', async () => {
  // Arrange
  const report: OrgReport = {
    yyyymm: '202606',
    rows: [
      { name: 'Ada Lovelace', position: 'Engineer', summary: summary() },
      { name: 'Grace Hopper', position: null, summary: summary({ overtimeMinutes: -60 }) },
    ],
  };

  // Act
  const cells = await cellsOf(await buildOrgWorkbook(t, report));

  // Assert
  assert.ok(cells.includes('Ada Lovelace'));
  assert.ok(cells.includes('Grace Hopper'));
  assert.ok(cells.includes(formatHM(t, -60)), 'a shortfall must survive into the org sheet');
});

test('an empty report still produces a readable workbook', async () => {
  // Arrange: a month with nothing in it must not fail the download.
  const report = individualReport({
    rows: [],
    summary: summary({ baselineMinutes: 0, weekdaySumMinutes: 0, overtimeMinutes: 0, totalSumMinutes: 0 }),
  });

  // Act
  const buffer = await buildIndividualWorkbook(t, report);
  const wb = new Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ArrayBuffer);

  // Assert
  assert.ok(wb.worksheets.length > 0, 'there must still be a sheet to open');
});
