import { FormEvent, useEffect, useState } from 'react';
import { AuthDegree, AuthMode, WorkspaceSessionProbeStatus, WorkspaceStatus } from '../../types/app';
import {
  ProfessorApplicationInput,
  ProfessorApplicationReceipt,
  StudentAuthInput,
  StudentAuthMode,
} from '../../services/appContracts';
import { WorkspaceStatusBanner } from '../../components/common/WorkspaceStatusBanner';

const degreeOptions: Array<{ id: AuthDegree; title: string; detail: string }> = [
  { id: 'B.Th', title: '神学学士 B.Th', detail: 'BACHELOR OF THEOLOGY' },
  { id: 'M.Div', title: '道学硕士 M.Div', detail: 'MASTER OF DIVINITY' },
  { id: 'M.P.Th', title: '教牧学研究硕士 M.P.Th', detail: 'MASTER OF PASTORAL THEOLOGY' },
  { id: 'D.Min', title: '教牧学博士 D.Min', detail: 'DOCTOR OF MINISTRY' },
  { id: 'Ph.D.', title: '哲学博士 Ph.D.', detail: 'DOCTOR OF PHILOSOPHY' },
];

function getAccountDisplayName(account: string) {
  const normalized = account.trim();
  if (!normalized) {
    return 'AMAS 学员';
  }

  const base = normalized.includes('@') ? normalized.split('@')[0] : normalized;
  const words = base
    .split(/[._\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return words.join(' ') || 'AMAS 学员';
}

function getReadableAuthError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error.message.includes('Account already exists')) {
    return '该账号已存在，请直接登录或更换账号。';
  }

  if (error.message.includes('Invalid account or password')) {
    return '账号或密码不正确，请重新输入。';
  }

  return error.message.trim() || fallback;
}

export function AuthGateway({
  initialAccount,
  resumeHint,
  onAuthenticate,
  onSubmitProfessorApplication,
  workspaceStatus,
  workspaceSessionProbeStatus,
  onRetryWorkspaceSync,
  onCheckWorkspaceSession,
  isRetryingWorkspaceSync = false,
  isCheckingWorkspaceSession = false,
}: {
  initialAccount?: string;
  resumeHint?: string | null;
  onAuthenticate: (payload: StudentAuthInput) => Promise<void>;
  onSubmitProfessorApplication: (payload: ProfessorApplicationInput) => Promise<ProfessorApplicationReceipt>;
  workspaceStatus: WorkspaceStatus | null;
  workspaceSessionProbeStatus: WorkspaceSessionProbeStatus | null;
  onRetryWorkspaceSync?: () => void;
  onCheckWorkspaceSession?: () => void;
  isRetryingWorkspaceSync?: boolean;
  isCheckingWorkspaceSession?: boolean;
}) {
  const [mode, setMode] = useState<AuthMode>('register');
  const [account, setAccount] = useState(initialAccount ?? '');
  const [password, setPassword] = useState('');
  const [degree, setDegree] = useState<AuthDegree>('B.Th');
  const [showDegreePicker, setShowDegreePicker] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [professorDraft, setProfessorDraft] = useState<ProfessorApplicationInput>({
    name: '',
    email: '',
    institution: '',
    focus: '',
  });

  const selectedDegree = degreeOptions.find((option) => option.id === degree) ?? degreeOptions[0];

  useEffect(() => {
    setNotice(null);
  }, [mode]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (mode === 'professor_apply') {
      if (!professorDraft.name.trim() || !professorDraft.email.trim() || !professorDraft.focus.trim()) {
        setNotice('请先填写姓名、邮箱和研究方向，再提交教授申请。');
        return;
      }

      setSubmitting(true);
      void onSubmitProfessorApplication(professorDraft)
        .then(() => {
          setNotice('教授资格申请已提交，教务处审核后会通过邮箱发送登录方式。');
          setProfessorDraft({
            name: '',
            email: '',
            institution: '',
            focus: '',
          });
          setMode('login');
        })
        .catch((error) => {
          setNotice(getReadableAuthError(error, '教授申请提交失败，请稍后重试。'));
        })
        .finally(() => {
          setSubmitting(false);
        });
      return;
    }

    if (!account.trim() || !password.trim()) {
      setNotice('请输入账号和密码后再继续。');
      return;
    }

    setSubmitting(true);
    void onAuthenticate({
      account: account.trim(),
      password,
      degree,
      displayName: getAccountDisplayName(account),
      mode: mode as StudentAuthMode,
    })
      .catch((error) => {
        setNotice(
          getReadableAuthError(error, mode === 'register' ? '注册失败，请稍后重试。' : '登录失败，请稍后重试。'),
        );
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  return (
    <div className="auth-gateway">
      <div className="auth-background-glow auth-background-glow-left" />
      <div className="auth-background-glow auth-background-glow-right" />

      <section className="auth-brand">
        <div className="auth-brand-logo">AMAS</div>
        <div className="auth-brand-copy">
          <strong>亚洲宣教神学院</strong>
          <span>ASIA MISSIONARY ASSOCIATION SEMINARY</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-mode-tabs">
          <button
            type="button"
            className={mode === 'register' ? 'auth-mode-tab active' : 'auth-mode-tab'}
            onClick={() => setMode('register')}
          >
            快速注册
          </button>
          <button
            type="button"
            className={mode === 'login' ? 'auth-mode-tab active' : 'auth-mode-tab'}
            onClick={() => setMode('login')}
          >
            登录账号
          </button>
        </div>

        {workspaceStatus && (
          <WorkspaceStatusBanner
            status={workspaceStatus}
            onRetry={onRetryWorkspaceSync}
            probeStatus={workspaceSessionProbeStatus}
            onProbe={onCheckWorkspaceSession}
            isRetrying={isRetryingWorkspaceSync}
            isProbing={isCheckingWorkspaceSession}
          />
        )}

        {resumeHint && <div className="auth-info-card">重新登录后会回到：{resumeHint}</div>}

        {notice && <p className="auth-notice">{notice}</p>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'professor_apply' ? (
            <>
              <div className="auth-info-card">
                教授账号需经教务处审核。提交后会进入后台验证流程，审核完成后再开放专属权限。
              </div>
              <label className="auth-field">
                <span>申请人姓名</span>
                <input
                  value={professorDraft.name}
                  onChange={(event) => setProfessorDraft((current) => ({ ...current, name: event.target.value }))}
                  placeholder="您的真实姓名"
                />
              </label>
              <label className="auth-field">
                <span>联系邮箱</span>
                <input
                  type="email"
                  value={professorDraft.email}
                  onChange={(event) => setProfessorDraft((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@example.org"
                />
              </label>
              <label className="auth-field">
                <span>所属机构</span>
                <input
                  value={professorDraft.institution}
                  onChange={(event) => setProfessorDraft((current) => ({ ...current, institution: event.target.value }))}
                  placeholder="神学院 / 差会 / 教会"
                />
              </label>
              <label className="auth-field">
                <span>研究方向</span>
                <input
                  value={professorDraft.focus}
                  onChange={(event) => setProfessorDraft((current) => ({ ...current, focus: event.target.value }))}
                  placeholder="宣教学 / 牧养学 / 圣经研究"
                />
              </label>
            </>
          ) : (
            <>
              <label className="auth-field">
                <span>{mode === 'register' ? '注册账号' : '登录账号'}</span>
                <input
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                  placeholder="账号名称或电子邮箱"
                />
              </label>
              <label className="auth-field">
                <span>{mode === 'register' ? '设置密码' : '登录密码'}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                />
              </label>

              {mode === 'register' && (
                <div className="auth-degree-card">
                  <div className="auth-degree-copy">
                    <span>身份及学位标注</span>
                    <strong>{selectedDegree.title}</strong>
                    <small>{selectedDegree.detail}</small>
                  </div>
                  <button type="button" className="secondary-btn compact-btn" onClick={() => setShowDegreePicker(true)}>
                    修改
                  </button>
                </div>
              )}
            </>
          )}

          <button type="submit" className="auth-submit-btn" disabled={submitting}>
            {submitting ? '处理中...' : mode === 'register' ? '立即加入 AMAS' : mode === 'login' ? '登录神学院平台' : '提交教授申请'}
          </button>

          <div className="auth-footer-actions">
            <button type="button" className="auth-link-btn" onClick={() => setMode('professor_apply')}>
              我是教授，申请入驻验证
            </button>
          </div>
        </form>

        <div className="auth-security-note">Secure Academic Gateway</div>
      </section>

      <p className="auth-caption">Asia Missionary Association Seminary</p>

      {showDegreePicker && (
        <div className="auth-degree-overlay" role="dialog" aria-modal="true">
          <div className="auth-degree-sheet">
            <div className="auth-degree-sheet-header">
              <div>
                <p className="eyebrow">Academic Track</p>
                <h2>选择当前身份</h2>
              </div>
              <button type="button" className="secondary-btn compact-btn" onClick={() => setShowDegreePicker(false)}>
                完成
              </button>
            </div>
            <div className="auth-degree-list">
              {degreeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={degree === option.id ? 'auth-degree-option active' : 'auth-degree-option'}
                  onClick={() => setDegree(option.id)}
                >
                  <strong>{option.title}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
