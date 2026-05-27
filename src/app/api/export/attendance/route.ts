import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireAdmin } from '@/lib/session';
import {
  resolveMonthRange,
  buildIndividualReport,
  buildOrgReport,
} from '@/lib/attendance-export';
import { buildIndividualWorkbook, buildOrgWorkbook } from '@/lib/attendance-excel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const Query = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  scope: z.enum(['self', 'member', 'all']),
  memberId: z.coerce.number().int().positive().optional(),
});

function xlsxResponse(buffer: Uint8Array<ArrayBuffer>, koreanFilename: string, yyyymm: string): Response {
  // Non-ASCII filenames go through RFC 5987's filename*, with an ASCII fallback for clients that do not support it.
  const asciiFallback = `attendance_${yyyymm}.xlsx`;
  const disposition = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(koreanFilename)}`;
  // TypeScript's generic Uint8Array<ArrayBufferLike> matches BodyInit only reluctantly, so it is wrapped as a BlobPart.
  return new Response(new Blob([buffer], { type: XLSX_MIME }), {
    status: 200,
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': disposition,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const parsed = Query.safeParse({
      year: sp.get('year'),
      month: sp.get('month'),
      scope: sp.get('scope'),
      memberId: sp.get('memberId') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Those request parameters are not valid' },
        { status: 400 },
      );
    }
    const { year, month, scope, memberId } = parsed.data;

    const now = new Date();
    const range = resolveMonthRange(year, month, now);
    if (!range.ok) {
      return NextResponse.json({ ok: false, error: range.error }, { status: 400 });
    }

    // The org sheet is a summary, and admin-only.
    if (scope === 'all') {
      await requireAdmin();
      const report = await buildOrgReport({ range, now });
      const buffer = await buildOrgWorkbook(report);
      return xlsxResponse(buffer, `attendance_all_${range.yyyymm}.xlsx`, range.yyyymm);
    }

    // Per-person detail: anyone may export their own; only an admin may export somebody else's.
    const session = await requireSession();
    let targetMemberId: number;
    if (scope === 'self') {
      targetMemberId = session.memberId;
    } else {
      if (!memberId) {
        return NextResponse.json(
          { ok: false, error: 'memberId is required' },
          { status: 400 },
        );
      }
      targetMemberId = memberId;
      if (targetMemberId !== session.memberId) {
        await requireAdmin();
      }
    }

    const report = await buildIndividualReport({ memberId: targetMemberId, range, now });
    if (!report) {
      return NextResponse.json(
        { ok: false, error: 'Could not find that' },
        { status: 404 },
      );
    }
    const buffer = await buildIndividualWorkbook(report);
    return xlsxResponse(
      buffer,
      `attendance_${report.member.name}_${range.yyyymm}.xlsx`,
      range.yyyymm,
    );
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[export/attendance] failed', e);
    return NextResponse.json(
      { ok: false, error: 'Could not build the spreadsheet' },
      { status: 500 },
    );
  }
}
