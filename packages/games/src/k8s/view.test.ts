import { describe, expect, it } from 'vitest';

import type { ClusterSpec, IncidentView } from './contract.ts';
import type { ActiveIncident, ClusterState } from './model.ts';
import { createCluster, emitEvent } from './model.ts';
import { toView } from './view.ts';

/**
 * Cụm thử: một pod khai đủ resources, một pod không khai gì, một Service.
 *
 * Cặp pod là chỗ giá trị của bộ test này nằm — "có khai" và "không khai" phải cho
 * ra hai kết quả KHÁC NHAU ở view, chứ không cùng ra `0m`.
 */
const SPEC: ClusterSpec = {
  nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
  namespaces: ['hoc-tap'],
  resources: [
    {
      kind: 'Pod',
      name: 'day-du',
      namespace: 'hoc-tap',
      spec: {
        labels: { app: 'web' },
        containers: [
          {
            name: 'chinh',
            image: 'nginx:1.27',
            resources: { requests: { cpu: '250m', memory: '128Mi' }, limits: { cpu: '500m', memory: '256Mi' } },
          },
          {
            name: 'phu',
            image: 'busybox:1.36',
            resources: { requests: { cpu: '50m', memory: '64Mi' } },
          },
        ],
      },
    },
    {
      kind: 'Pod',
      name: 'khong-khai',
      namespace: 'hoc-tap',
      spec: { containers: [{ name: 'chinh', image: 'nginx:1.27' }] },
    },
    { kind: 'Service', name: 'web', namespace: 'hoc-tap', spec: { selector: { app: 'web' } } },
  ],
};

function stateOf(): ClusterState {
  return createCluster(SPEC, 1);
}

function objectNamed(state: ClusterState, name: string) {
  const object = state.objects.find((item) => item.name === name);
  expect(object, `cụm thử phải có ${name}`).toBeDefined();
  return object!;
}

describe('ObjectView — ba trường bảng Tổng quan cần', () => {
  it('nhãn đi qua NGUYÊN tham chiếu, không sao chép', () => {
    const state = stateOf();
    const source = objectNamed(state, 'day-du');
    const view = toView(state).objects.find((item) => item.name === 'day-du');

    expect(view?.labels).toEqual({ app: 'web' });
    /* `toBe` chứ không `toEqual`: một bản sao cũng qua được `toEqual`, và bản
     * sao là đúng thứ phép đo này sinh ra để chặn — `toView` chạy mỗi tick cho
     * mọi object, nên sao chép ở đây là rác đều đặn, và nó phá cả phép so
     * `Object.is` mà React dùng để bỏ qua render. */
    expect(view?.labels).toBe(source.labels);
  });

  it('requests/limits cộng dồn qua mọi container, định dạng theo ký pháp K8s', () => {
    const view = toView(stateOf()).objects.find((item) => item.name === 'day-du');
    // 250m + 50m, 128Mi + 64Mi. Container thứ hai không khai limits nên limits
    // chỉ mang phần của container đầu — đúng như `kubectl describe` in ra.
    expect(view?.requests).toEqual({ cpu: '300m', memory: '192Mi' });
    expect(view?.limits).toEqual({ cpu: '500m', memory: '256Mi' });
  });

  /**
   * ĐỐI CHỨNG ÂM cho phép đo trên. Không có nó thì một cài đặt cộng `?? 0` vẫn
   * xanh ở test trước, trong khi nó hiện `0m` cho một pod chưa khai gì — và
   * người học đọc `0m` ra thành "đã khai, khai bằng 0".
   */
  it('không container nào khai ⇒ null, KHÔNG phải 0m', () => {
    const view = toView(stateOf()).objects.find((item) => item.name === 'khong-khai');
    expect(view?.requests).toBeNull();
    expect(view?.limits).toBeNull();
  });

  it('loại không có container không bịa ra số liệu', () => {
    const view = toView(stateOf()).objects.find((item) => item.kind === 'Service');
    expect(view?.requests).toBeNull();
    expect(view?.limits).toBeNull();
  });

  it('createdTick đi ra tới view — tuổi tính tại chỗ dùng, không lưu', () => {
    const state = stateOf();
    const view = toView(state).objects.find((item) => item.name === 'day-du');
    expect(view?.createdTick).toBe(objectNamed(state, 'day-du').createdTick);
  });
});

describe('EventView — trục lọc theo object', () => {
  it('involvedUid đi qua, cả khi là null', () => {
    const base = stateOf();
    const uid = objectNamed(base, 'day-du').uid;
    const withEvents = emitEvent(
      emitEvent(base, { level: 'warning', message: 'pod hỏng', reason: 'BackOff', involvedUid: uid }),
      { level: 'info', message: 'quota cụm', reason: 'Quota', involvedUid: null },
    );

    const events = toView(withEvents).events;
    expect(events.map((event) => event.involvedUid)).toEqual([uid, null]);
  });

  /**
   * Chính là lỗi mà trường này sinh ra để chặn: lọc bằng cách dò tên trong câu
   * chữ cho pod `web` ăn luôn sự kiện của `web-2`. Ở đây lọc theo uid phải tách
   * bạch, kể cả khi một tên là tiền tố của tên kia.
   */
  it('hai tên lồng nhau vẫn lọc tách bạch — thứ dò-tên-trong-câu-chữ không làm được', () => {
    const base = createCluster(
      {
        nodes: SPEC.nodes,
        namespaces: ['hoc-tap'],
        resources: [
          { kind: 'Pod', name: 'web', namespace: 'hoc-tap', spec: {} },
          { kind: 'Pod', name: 'web-2', namespace: 'hoc-tap', spec: {} },
        ],
      },
      1,
    );
    const web2 = objectNamed(base, 'web-2').uid;
    const state = emitEvent(base, {
      level: 'error',
      message: 'Pod web-2 không khởi động được',
      reason: 'BackOff',
      involvedUid: web2,
    });

    const forWeb = toView(state).events.filter((event) => event.involvedUid === objectNamed(base, 'web').uid);
    expect(forWeb).toHaveLength(0);
  });
});

describe('ClusterView.incidents', () => {
  const incident: ActiveIncident = {
    kind: 'image-tag-sai',
    targetUid: 'o0',
    startedTick: 3,
    resolvedTick: null,
  };

  it('sự cố của state đi thẳng ra view, không sao chép', () => {
    const state: ClusterState = { ...stateOf(), incidents: [incident] };
    const view = toView(state);
    expect(view.incidents).toBe(state.incidents);
    expect(view.incidents[0]?.resolvedTick).toBeNull();
  });

  it('sự cố đã xử lý được GIỮ LẠI kèm tick, không bị lọc mất', () => {
    const done: ActiveIncident = { ...incident, resolvedTick: 9 };
    const view = toView({ ...stateOf(), incidents: [incident, done] });
    expect(view.incidents).toHaveLength(2);
    expect(view.incidents.filter((item) => item.resolvedTick !== null)).toHaveLength(1);
  });

  /**
   * CỔNG GÁC HAI CHIỀU cho phép truyền thẳng ở trên.
   *
   * `toView` gán `state.incidents` sang `readonly IncidentView[]` mà không map,
   * nên hai kiểu phải ở NGUYÊN hình dạng của nhau. Thêm một field vào
   * `ActiveIncident` mà quên `IncidentView` sẽ rò một field nội bộ của engine ra
   * giao diện trong im lặng — cấu trúc thật vẫn mang nó, chỉ có kiểu là không
   * khai. Hai phép gán dưới đây đỏ ở typecheck; phép so khoá đỏ lúc chạy.
   */
  it('IncidentView và ActiveIncident cùng bộ khoá — cả hai chiều', () => {
    const asView: IncidentView = incident;
    const asModel: ActiveIncident = asView;
    expect(Object.keys(asModel).sort()).toEqual(['kind', 'resolvedTick', 'startedTick', 'targetUid']);
  });
});
