import { TRPCError } from '@trpc/server';
import type { ContentSource } from '@devops-platform/scenario';
import type { Lab, Playground } from '@devops-platform/shared-types';
import { publishedContentSource } from '../content/source';

/**
 * Nguồn nội dung lab + playground của BFF — mirror của
 * `server/lessons/catalog.ts#scenarioSource` cho trụ cột ② (P8).
 *
 * `ContentSource` là MỘT object phục vụ cả ba loại nội dung
 * (scenario/lab/playground) — nên lab và playground dùng chung một nguồn với
 * lesson, không phải hai nguồn song song.
 *
 * ⚠ ĐỔI Ở P9: trước đây file này tự dựng `filesystemScenarioSource(scenariosDir())`
 * và cache một instance riêng, vì `lessons/catalog.ts` không nằm trong quyền sở
 * hữu file của lane P8. Hai instance đọc cùng một thư mục bất biến thì vô hại.
 * Với nguồn DB thì KHÔNG còn vô hại: hai composite độc lập nghĩa là hai luật ưu
 * tiên có thể trôi khỏi nhau, và câu hỏi "bài này tới từ đâu" có hai câu trả
 * lời. Giờ cả hai catalog gọi vào `content/source.ts`, nơi giữ MỘT luật gộp và
 * MỘT cache cho phần đĩa.
 */
function contentSource(): ContentSource {
  return publishedContentSource();
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
