import { redirect } from 'next/navigation';
import { readViewerSession } from '../../../components/catalog/viewer-role.server';
import { withReturnPath } from '../../login/return-path';
import { PathClient } from './path-client';

/** Server Component, kiểm auth THẬT (đụng DB), cùng khuôn `/labs/[id]`. */
export default async function PathPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if ((await readViewerSession()) === null) {
    redirect(withReturnPath('/login', `/paths/${encodeURIComponent(id)}`));
  }
  return <PathClient pathId={id} />;
}
