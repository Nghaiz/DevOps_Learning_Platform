/**
 * Semaphore liên-tiến-trình cho pod smoke trên MÁY NÀY.
 *
 * Cụm chỉ có một node; pod profile k8s xin ~1Gi, và node bão hoà làm MỌI THỨ
 * chập chờn (probe trượt, verify quá hạn) — tức một lượt smoke đỏ vì một lượt
 * smoke khác. Nhiều agent viết nội dung chạy harness cùng lúc, nên trần phải
 * nằm ngoài từng tiến trình: mỗi khe là một file tạo bằng cờ `wx` (atomic), giữ
 * PID chủ. Khe của tiến trình đã chết được thu hồi.
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SLOT_DIR = path.join(os.tmpdir(), 'dlp-content-smoke-slots');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function tryTake(file, owner) {
  try {
    const fd = openSync(file, 'wx');
    writeSync(fd, JSON.stringify(owner));
    closeSync(fd);
    return true;
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
  }
  try {
    const holder = JSON.parse(readFileSync(file, 'utf8'));
    if (!isAlive(holder.pid)) {
      unlinkSync(file);
      return tryTake(file, owner);
    }
  } catch {
    // File đang được ghi dở, hoặc vừa bị chủ khác gỡ — lượt sau thử lại.
  }
  return false;
}

/** Chờ tới khi có khe; trả hàm nhả khe (gọi nhiều lần vô hại). */
export async function acquireSlot(max, label, onWait) {
  mkdirSync(SLOT_DIR, { recursive: true });
  const owner = { pid: process.pid, label, since: new Date().toISOString() };
  let warned = false;
  for (;;) {
    for (let i = 0; i < max; i += 1) {
      const file = path.join(SLOT_DIR, `slot-${i}.lock`);
      if (tryTake(file, owner)) {
        let released = false;
        return () => {
          if (released) return;
          released = true;
          try {
            unlinkSync(file);
          } catch {
            // đã bị thu hồi
          }
        };
      }
    }
    if (!warned) {
      onWait?.(max);
      warned = true;
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
}
