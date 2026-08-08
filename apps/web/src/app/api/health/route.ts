import { NextResponse } from 'next/server';

/**
 * Contract ghim với Helm probe (readinessProbe/livenessProbe) — KHÔNG được đụng
 * DB/Redis. Một Postgres/Redis chậm không được kéo pod web xuống "not ready".
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}
