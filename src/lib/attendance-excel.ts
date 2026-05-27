import { Workbook, type Border, type Cell, type Worksheet } from 'exceljs';
import type { IndividualReport, OrgReport } from './attendance-export';

/** Template colours (ARGB, with alpha FF). */
const FILL_INDIVIDUAL_HEADER = 'FFFFE599'; // per-person sheet header (yellow)
const FILL_SUMMARY_LABEL = 'FFD9EAD3'; // summary labels (light green)
const FILL_ORG_HEADER = 'FFFFF2CC'; // org sheet header (cream)
const FONT_NAME = 'Arial';
const SHEET_NAME = 'Sheet1';

const THIN: Partial<Border> = { style: 'thin' };

/** Always hours and minutes, including zeros, with the sign in front for negatives. */
export function formatHM(minutes: number): string {
  const negative = minutes < 0;
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${negative ? '-' : ''}${h}h ${m}m`;
}

function styleHeaderCell(cell: Cell, fill: string): void {
  cell.font = { name: FONT_NAME, bold: true };
  cell.alignment = { horizontal: 'center' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
}

function styleDataCell(cell: Cell, value: string | number): void {
  cell.value = value;
  cell.font = { name: FONT_NAME };
  cell.alignment = { horizontal: 'right' };
}

function writeHeaderRow(ws: Worksheet, headers: string[], fill: string): void {
  headers.forEach((label, idx) => {
    const cell = ws.getCell(1, idx + 1);
    cell.value = label;
    styleHeaderCell(cell, fill);
  });
}

/** Column widths by one-based index, generous enough that labels and duration values are not clipped. */
function setColumnWidths(ws: Worksheet, widths: Record<number, number>): void {
  for (const [col, width] of Object.entries(widths)) {
    ws.getColumn(Number(col)).width = width;
  }
}

async function toBytes(wb: Workbook): Promise<Uint8Array<ArrayBuffer>> {
  // Copies what writeBuffer returns into an ArrayBuffer-backed Uint8Array, so it matches the BufferSource a Response or Blob body expects.
  const data = (await wb.xlsx.writeBuffer()) as unknown as Uint8Array;
  const out = new Uint8Array(data.byteLength);
  out.set(data);
  return out;
}

/**
 * The per-person sheet: the daily table in columns A to F and the summary in H and I.
 * Emphasis is a border box around H4:I5, weekday overtime and holiday work, rather than colour, matching the template.
 */
export async function buildIndividualWorkbook(report: IndividualReport): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  writeHeaderRow(
    ws,
    ['Date', 'Worked', 'Away', 'Holiday', 'Leave', 'Total'],
    FILL_INDIVIDUAL_HEADER,
  );

  report.rows.forEach((row, idx) => {
    const r = idx + 2;
    styleDataCell(ws.getCell(r, 1), row.date); // numeric yyyyMMdd
    styleDataCell(ws.getCell(r, 2), formatHM(row.workMinutes));
    styleDataCell(ws.getCell(r, 3), formatHM(row.breakMinutes));
    styleDataCell(ws.getCell(r, 4), row.isHoliday ? 'Y' : 'N');
    styleDataCell(ws.getCell(r, 5), row.leaveLabel);
    styleDataCell(ws.getCell(r, 6), formatHM(row.sumMinutes));
  });

  const s = report.summary;
  const summaryRows: Array<[string, number]> = [
    ['Based on attendance records', s.baselineMinutes],
    ['Weekday total', s.weekdaySumMinutes],
    ['Weekday overtime', s.overtimeMinutes],
    ['Holiday total', s.holidaySumMinutes],
    ['Grand total', s.totalSumMinutes],
  ];
  summaryRows.forEach(([label, value], idx) => {
    const r = idx + 2; // H2~H6 / I2~I6
    const labelCell = ws.getCell(r, 8); // H
    labelCell.value = label;
    styleHeaderCell(labelCell, FILL_SUMMARY_LABEL);
    styleDataCell(ws.getCell(r, 9), formatHM(value)); // I
  });

  // The emphasis border box: H4:I5, weekday overtime and holiday work.
  ws.getCell(4, 8).border = { left: THIN, top: THIN }; // H4
  ws.getCell(4, 9).border = { right: THIN, top: THIN }; // I4
  ws.getCell(5, 8).border = { left: THIN, bottom: THIN }; // H5
  ws.getCell(5, 9).border = { right: THIN, bottom: THIN }; // I5

  setColumnWidths(ws, { 1: 16, 2: 13, 3: 13, 4: 11, 5: 13, 6: 13, 7: 3, 8: 16, 9: 15 });

  return toBytes(wb);
}

/** The org sheet: one summary row per member. A flat table with no emphasis, matching the template. */
export async function buildOrgWorkbook(report: OrgReport): Promise<Uint8Array<ArrayBuffer>> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET_NAME);

  writeHeaderRow(
    ws,
    ['Name', 'Title', 'Weekday total', 'Weekday overtime', 'Holiday total', 'Grand total'],
    FILL_ORG_HEADER,
  );

  report.rows.forEach((row, idx) => {
    const r = idx + 2;
    styleDataCell(ws.getCell(r, 1), row.name);
    styleDataCell(ws.getCell(r, 2), row.position ?? '');
    styleDataCell(ws.getCell(r, 3), formatHM(row.summary.weekdaySumMinutes));
    styleDataCell(ws.getCell(r, 4), formatHM(row.summary.overtimeMinutes));
    styleDataCell(ws.getCell(r, 5), formatHM(row.summary.holidaySumMinutes));
    styleDataCell(ws.getCell(r, 6), formatHM(row.summary.totalSumMinutes));
  });

  setColumnWidths(ws, { 1: 14, 2: 12, 3: 16, 4: 16, 5: 16, 6: 16 });

  return toBytes(wb);
}
