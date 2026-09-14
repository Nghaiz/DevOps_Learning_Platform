import type { ResourceKind } from '@devops-platform/games';
import {
  createLucideIcon,
  Layers3,
  LibraryBig,
  Orbit,
  BadgeCheck,
  AlarmClock,
  Scaling,
  ShieldCheck,
  Network,
  Waypoints,
  ShieldBan,
  FileSliders,
  LockKeyhole,
  ContactRound,
  KeyRound,
  Link2,
  ShieldUser,
  HardDriveDownload,
  Database,
  HardDrive,
  Scan,
  Gauge,
  SlidersHorizontal,
  Server,
  type LucideIcon,
} from 'lucide-react';

// Keep the same 24px grid, stroke and round caps as Lucide. These small diagrams
// explain the resources that a generic square or orbit could not distinguish.
const PodContainers = createLucideIcon('PodContainers', [
  ['path', { d: 'M12 2 22 7v10l-10 5L2 17V7Z', key: 'shell' }],
  ['rect', { x: '6', y: '8', width: '5', height: '8', rx: '1', key: 'container-a' }],
  ['rect', { x: '14', y: '8', width: '4', height: '8', rx: '1', key: 'container-b' }],
]);
const DeploymentRollout = createLucideIcon('DeploymentRollout', [
  ['path', { d: 'M4 7h15m-4-4 4 4-4 4', key: 'rollout' }],
  ['rect', { x: '3', y: '14', width: '5', height: '7', rx: '1', key: 'replica-a' }],
  ['rect', { x: '10', y: '14', width: '5', height: '7', rx: '1', key: 'replica-b' }],
  ['rect', { x: '17', y: '14', width: '4', height: '7', rx: '1', key: 'replica-c' }],
]);
const IngressGateway = createLucideIcon('IngressGateway', [
  ['path', { d: 'M8 3h12v18H8M2 12h13m-4-4 4 4-4 4', key: 'incoming-route' }],
]);

/** A distinct functional silhouette for every resource, independent of color. */
export const RESOURCE_ICON = {
  Pod: PodContainers,
  Deployment: DeploymentRollout,
  ReplicaSet: Layers3,
  StatefulSet: LibraryBig,
  DaemonSet: Orbit,
  Job: BadgeCheck,
  CronJob: AlarmClock,
  HorizontalPodAutoscaler: Scaling,
  PodDisruptionBudget: ShieldCheck,
  Service: Network,
  Ingress: IngressGateway,
  NetworkPolicy: ShieldBan,
  ConfigMap: FileSliders,
  Secret: LockKeyhole,
  ServiceAccount: ContactRound,
  Role: KeyRound,
  RoleBinding: Link2,
  ClusterRole: ShieldUser,
  ClusterRoleBinding: Waypoints,
  PersistentVolumeClaim: HardDriveDownload,
  PersistentVolume: Database,
  StorageClass: HardDrive,
  Namespace: Scan,
  ResourceQuota: Gauge,
  LimitRange: SlidersHorizontal,
  Node: Server,
} satisfies Record<ResourceKind, LucideIcon>;
