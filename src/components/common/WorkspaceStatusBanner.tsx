import { WorkspaceSessionProbeStatus, WorkspaceStatus } from '../../types/app';

export function WorkspaceStatusBanner({
  status,
  onRetry,
  probeStatus,
  onProbe,
  onRefresh,
  isRetrying = false,
  isProbing = false,
  isRefreshing = false,
}: {
  status: WorkspaceStatus;
  onRetry?: () => void;
  probeStatus?: WorkspaceSessionProbeStatus | null;
  onProbe?: () => void;
  onRefresh?: () => void;
  isRetrying?: boolean;
  isProbing?: boolean;
  isRefreshing?: boolean;
}) {
  return (
    <section className={`workspace-status-banner workspace-status-${status.tone}`}>
      <div className="workspace-status-copy">
        <p className="eyebrow">Workspace Status</p>
        <strong>{status.title}</strong>
        <p>{status.detail}</p>
        {probeStatus && (
          <div className={`workspace-status-probe workspace-status-probe-${probeStatus.tone}`}>
            <span>{probeStatus.title}</span>
            <p>
              {probeStatus.detail}
              {probeStatus.checkedAt ? ` · ${new Date(probeStatus.checkedAt).toLocaleString('zh-CN')}` : ''}
            </p>
          </div>
        )}
      </div>
      <div className="workspace-status-actions">
        {onRefresh && probeStatus?.tone === 'warning' && status.tone !== 'local' && status.tone !== 'expired' && (
          <button
            type="button"
            className="primary-btn compact-btn"
            onClick={onRefresh}
            disabled={isRefreshing || isProbing || isRetrying}
          >
            {isRefreshing ? '延长中...' : '延长会话'}
          </button>
        )}
        {onProbe && status.tone !== 'local' && status.tone !== 'expired' && (
          <button
            type="button"
            className="secondary-btn compact-btn"
            onClick={onProbe}
            disabled={isProbing || isRetrying || isRefreshing}
          >
            {isProbing ? '检查中...' : '检查登录态'}
          </button>
        )}
        {onRetry && status.tone === 'degraded' && (
          <button
            type="button"
            className="secondary-btn compact-btn"
            onClick={onRetry}
            disabled={isRetrying || isRefreshing}
          >
            {isRetrying ? '重试中...' : '重新同步'}
          </button>
        )}
      </div>
    </section>
  );
}
