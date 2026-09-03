import { TRPCError } from '@trpc/server';
import { filesystemScenarioSource, type ContentSource } from '@devops-platform/scenario';
import type { Lab, Playground } from '@devops-platform/shared-types';
import { scenariosDir } from '../env';

/**
 * Nguồn nội dung lab + playground của BFF — mirror của
 * `server/lessons/catalog.ts#scenarioSource` cho trụ cột ② (P8).
 *
 * `filesystemScenarioSource(scenariosDir())` (8.A, `packages/scenario/src/source.ts`)
 * trả về `ContentSource` — MỘT object phục vụ cả ba loại nội dung
 * (scenario/lab/playground), suy `content/labs`/`content/playgrounds` là THƯ
 * MỤC ANH EM của `content/scenarios` theo đúng bố cục thật trên đĩa. Cache MỘT
 * instance ở đây thay vì gọi lại `scenarioSource()` của `lessons/catalog.ts`
 * (file đó không nằm trong quyền sở hữu của lane này) — cái giá là mỗi instance
 * tự nạp + giữ cache riêng (`filesystemScenarioSource` đã tự khử trùng lặp nạp
 * đồng thời bằng promise cache nội bộ của nó, xem `source.ts`), chấp nhận được
 * vì lab/playground chỉ có vài chục mục.
 */
let cachedSource: ContentSource | null = null;

function contentSource(): ContentSource {
  cachedSource ??= filesystemScenarioSource(scenariosDir());
  return cachedSource;
}

export function labSource(): ContentSource {
  return contentSource();
}

export function playgroundSource(): ContentSource {
  return contentSource();
}

export async function requireLab(labId: string): Promise<Lab> {
  const lab = await labSource().getLab(labId);
  if (lab === null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Không có lab "${labId}"` });
  }
  return lab;
}

export async function requirePlayground(playgroundId: string): Promise<Playground> {
  const playground = await playgroundSource().getPlayground(playgroundId);
  if (playground === null) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Không có playground "${playgroundId}"` });
  }
  return playground;
}
