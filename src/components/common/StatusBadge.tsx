import { ModuleStatus } from '../../types/app';

const labels: Record<ModuleStatus, string> = {
  recovered: '已抢救',
  rebuild: '重建中',
  pending: '待恢复',
};

export function StatusBadge({ status }: { status: ModuleStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
