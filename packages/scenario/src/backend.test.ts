import { describe, expect, it } from 'vitest';
import { BACKEND_IMAGE_MAPPING, KNOWN_BACKEND_IMAGE_IDS, mapBackendImage } from './backend.ts';

describe('mapBackendImage', () => {
  it('ubuntu là sandbox trần, không đòi năng lực gì', () => {
    expect(mapBackendImage('ubuntu')).toEqual({ tier: 'sysbox', capabilities: [] });
  });

  it('imageid kubernetes luôn kèm capability kubernetes', () => {
    for (const [imageId, mapping] of Object.entries(BACKEND_IMAGE_MAPPING)) {
      if (imageId.startsWith('kubernetes-')) {
        expect(mapping.capabilities, imageId).toContain('kubernetes');
      }
    }
  });

  it('2nodes kèm thêm multi-node, 1node thì không', () => {
    expect(mapBackendImage('kubernetes-kubeadm-2nodes')?.capabilities).toContain('multi-node');
    expect(mapBackendImage('kubernetes-kubeadm-1node')?.capabilities).not.toContain('multi-node');
  });

  /**
   * Chốt cứng rằng bảng là BẢNG chứ không phải heuristic tiền tố: một imageid
   * chưa từng được xem xét phải trả null để loader ném, kể cả khi nó trông y hệt
   * một dòng đã có.
   */
  it('imageid chưa xem xét trả null, kể cả khi trông quen', () => {
    expect(mapBackendImage('kubernetes-kubeadm-3nodes')).toBeNull();
    expect(mapBackendImage('ubuntu-24.04')).toBeNull();
    expect(mapBackendImage('')).toBeNull();
  });

  it('mọi tier khai ra đều là tier P1 dựng thật (chưa có gvisor/kata)', () => {
    for (const [imageId, mapping] of Object.entries(BACKEND_IMAGE_MAPPING)) {
      expect(mapping.tier, imageId).toBe('sysbox');
    }
  });

  it('KNOWN_BACKEND_IMAGE_IDS khớp bảng và đã sắp xếp', () => {
    expect(KNOWN_BACKEND_IMAGE_IDS).toEqual([...Object.keys(BACKEND_IMAGE_MAPPING)].sort());
  });
});
