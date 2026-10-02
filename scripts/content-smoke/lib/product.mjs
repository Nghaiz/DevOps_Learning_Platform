/**
 * Cầu nối tới MÃ SẢN PHẨM — harness gọi đúng các hàm thuần mà server dùng, không
 * chép lại chúng. Một bản chép là bản sẽ lệch: lần đầu ai đó sửa thứ tự setup
 * hay prelude ở server, bộ kiểm thử vẫn xanh trên một luồng không còn tồn tại.
 *
 * `packages/scenario` export nguồn `.ts` với specifier `.ts` nên Node 24 nạp
 * thẳng (type stripping). `apps/web/src/server/**` thì viết import KHÔNG đuôi
 * (`'./phase'`, `'../labs/output'`) theo kiểu bundler — Node ESM từ chối. Hook
 * resolve dưới đây thêm `.ts` cho ĐÚNG những import tương đối không đuôi xuất
 * phát từ `apps/web/src/`; mọi chỗ khác đi đường resolve mặc định.
 */
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const WEB_SRC_URL = pathToFileURL(path.join(REPO_ROOT, 'apps', 'web', 'src') + path.sep).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromWeb = context.parentURL?.startsWith(WEB_SRC_URL) ?? false;
    const isBareRelative =
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[cm]?[jt]sx?$/.test(specifier);
    if (fromWeb && isBareRelative) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(`${specifier}/index.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const fromRepo = (...parts) => pathToFileURL(path.join(REPO_ROOT, ...parts)).href;

const scenario = await import(fromRepo('packages', 'scenario', 'src', 'index.ts'));
const sharedScenario = await import(fromRepo('packages', 'shared-types', 'src', 'scenario.ts'));
const assetPush = await import(fromRepo('apps', 'web', 'src', 'server', 'lessons', 'asset-push.ts'));
const toolsEnable = await import(fromRepo('apps', 'web', 'src', 'server', 'lessons', 'tools-enable.ts'));
const setupPlan = await import(fromRepo('apps', 'web', 'src', 'server', 'lessons', 'setup-plan.ts'));
const setupBackground = await import(
  fromRepo('apps', 'web', 'src', 'server', 'labs', 'setup-background.ts')
);

export const {
  loadScenario,
  loadLab,
  parseContentBlocks,
  parseCheckCriteria,
  withVerifyPrelude,
  resolveScenarioAssets,
} = scenario;
export const { effectiveCapabilities } = sharedScenario;
export const { buildAssetPushScript } = assetPush;
export const { buildToolsEnableScript } = toolsEnable;
export const { setupScriptPlan } = setupPlan;
export const { launchedBackgroundStep, SETUP_PROBE_SCRIPT, parseSetupProbe } = setupBackground;

/**
 * BẢN CHÉP của `profileForCapabilities` (apps/web/src/server/lessons/catalog.ts).
 *
 * Chép vì không import được: catalog.ts kéo `../content/source` → chuỗi import
 * có cú pháp TS mà type stripping không nhận (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX,
 * đo 2026-10-03). Ba dòng, và `profile` mà harness chọn được in ra trong báo
 * cáo cạnh tên profile thật của orchestrator, nên lệch là thấy.
 */
export function profileForCapabilities(capabilities, interfaceLayout) {
  if (capabilities.includes('multi-node')) return 'k8s-multinode';
  if (capabilities.includes('kubernetes')) return 'k8s';
  return interfaceLayout === 'ide' ? 'ide' : '';
}

/** `lessons.ts` → `profileForScenario`: đi qua `effectiveCapabilities`. */
export const profileForScenario = (s) =>
  profileForCapabilities(effectiveCapabilities(s), s.interfaceLayout);

/** `labs.ts` → `profileForLab`: `lab.capabilities` THÔ (nợ đã ghi ở labs.ts `sandboxCapabilities`). */
export const profileForLab = (lab) => profileForCapabilities(lab.capabilities, lab.interfaceLayout);

/** Khối người học bấm chạy: `{{exec}}` + `{{exec interrupt}}`, theo thứ tự trong markdown. */
export function execBlocks(markdown) {
  return parseContentBlocks(markdown)
    .filter((b) => b.kind === 'code' && (b.action === 'exec' || b.action === 'exec-interrupt'))
    .map((b) => ({ code: b.code, interrupt: b.action === 'exec-interrupt' }));
}
