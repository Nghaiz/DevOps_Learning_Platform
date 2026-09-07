import { effectiveCapabilities } from '@devops-platform/shared-types/scenario';
import { profileForCapabilities, scenarioSource } from '../../../server/lessons/catalog';
import { LessonClient } from './lesson-client';

/**
 * Auth đã do `lessons/layout.tsx` gác (và `proxy.ts` gác lớp ngoài). Page này gỡ
 * `params` — Next 16 trả `params` dưới dạng Promise — và giải PROFILE của bài.
 *
 * ## Vì sao profile được giải ở ĐÂY chứ không ở client
 *
 * `profileForCapabilities` là chỗ DUY NHẤT quyết định pod thật xin bao nhiêu
 * RAM (`lessons.startSession` gọi đúng hàm đó). Muốn nhãn "còn N chỗ" cạnh nút
 * Bắt đầu nói về ĐÚNG bài đang mở, client phải biết profile — và có đúng hai
 * cách: chép bảng ánh xạ sang FE, hoặc để máy chủ trả lời. Bản chép là hai bảng
 * sẽ trôi khỏi nhau, và lần trôi đó lại in một con số sai cạnh một nút hỏng;
 * nên ta chọn cách thứ hai. `catalog.ts` là mã server (`node:path`, DB) nên
 * KHÔNG import được vào `'use client'` — Server Component này là chỗ hợp lệ duy
 * nhất trong sở hữu của lượt vá để gọi nó.
 *
 * ⚠ NỢ, ghi ra chứ không giấu: đây là lượt đọc nội dung THỨ HAI cho cùng một
 * trang (client vẫn gọi `lessons.get`). Với bài trên đĩa thì gần như miễn phí —
 * `filesystemScenarioSource` cache cả vòng đời tiến trình và `compositeSource.get`
 * dừng ở nguồn đầu tiên trả khác `null` — nhưng với bài soạn trên DB thì đó là
 * một truy vấn thật, mỗi lần mở trang. Cách rẻ hơn là để `lessons.get` trả thẳng
 * `profile` trong payload (một field, không thêm lượt đọc nào); đó là việc ở
 * `apps/web/src/server/**`, ngoài sở hữu của lượt này — xem báo cáo.
 *
 * `null` = không có bài đó ⇒ client tự hiện lỗi qua `lessons.get`. Không ném
 * `notFound()` ở đây: hai nguồn cùng phán "không tồn tại" là hai câu chữ khác
 * nhau cho cùng một tình huống, và câu của client là câu đã có test.
 */
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await scenarioSource().get(id);
  const profile =
    scenario === null
      ? null
      : profileForCapabilities(effectiveCapabilities(scenario), scenario.interfaceLayout);

  return <LessonClient scenarioId={id} profile={profile} />;
}
