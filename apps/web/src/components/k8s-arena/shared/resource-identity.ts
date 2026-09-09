import type { ResourceKind } from '@devops-platform/games';
import { KIND_ACCENT } from '../arena-contract';

export const RESOURCE_KINDS = Object.keys(KIND_ACCENT) as ResourceKind[];

/**
 * Categorical colors for the dark arena, shared by the HUD and sRGB scene.
 * Keep every resource vivid, including infrastructure. Separate neighboring
 * kinds by hue instead of washing them out into pastel or neutral shades.
 * Icons and labels remain the primary identifiers; color is a supporting cue.
 */
const PALETTE = {
  Pod: [216, 86, 58],
  ReplicaSet: [350, 84, 59],
  Deployment: [132, 82, 55],
  StatefulSet: [286, 83, 60],
  DaemonSet: [42, 92, 57],
  Job: [18, 91, 58],
  CronJob: [306, 85, 59],
  Service: [58, 89, 55],
  Ingress: [194, 89, 56],
  NetworkPolicy: [8, 85, 56],
  ConfigMap: [32, 90, 57],
  Secret: [326, 86, 57],
  PersistentVolume: [164, 86, 54],
  PersistentVolumeClaim: [250, 84, 62],
  StorageClass: [92, 80, 55],
  ServiceAccount: [178, 85, 53],
  Role: [234, 84, 61],
  RoleBinding: [116, 79, 58],
  ClusterRole: [266, 86, 58],
  ClusterRoleBinding: [338, 82, 62],
  Namespace: [276, 85, 62],
  Node: [154, 82, 53], // Green infrastructure remains distinct from blue Pods.
  HorizontalPodAutoscaler: [204, 88, 61],
  PodDisruptionBudget: [74, 84, 56],
  ResourceQuota: [364, 89, 61],
  LimitRange: [102, 85, 52],
} satisfies Record<ResourceKind, readonly [number, number, number]>;

export const RESOURCE_HSL = Object.fromEntries(
  RESOURCE_KINDS.map((kind) => {
    const [h, s, l] = PALETTE[kind];
    return [kind, { h: h / 360, s: s / 100, l: l / 100 }];
  }),
) as Record<ResourceKind, { h: number; s: number; l: number }>;

export const RESOURCE_COLOR = Object.fromEntries(
  RESOURCE_KINDS.map((kind) => {
    const [h, s, l] = PALETTE[kind];
    return [kind, `hsl(${h} ${s}% ${l}%)`];
  }),
) as Record<ResourceKind, string>;
