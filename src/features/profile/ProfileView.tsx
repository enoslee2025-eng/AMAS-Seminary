import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { communityPosts } from '../../data/mockData';
import { DisplayCourse, LearningOverview } from '../courses/courseState';
import { AppBackupPayload, LibraryResource, ProfileState } from '../../types/app';
import { downloadAppBackup, parseAppBackupFile } from '../../services/appBackup';

export function ProfileView({
  profile,
  onUpdateProfile,
  displayCourses,
  rebuildMilestones,
  continueLearningCourses,
  learningOverview,
  recentViewedResources,
  libraryViewedCount,
  libraryFavoriteCount,
  createBackupPayload,
  onRestoreBackup,
  onOpenCourse,
  onOpenResource,
}: {
  profile: ProfileState;
  onUpdateProfile: Dispatch<SetStateAction<ProfileState>>;
  displayCourses: DisplayCourse[];
  rebuildMilestones: Array<{ title: string; detail: string }>;
  continueLearningCourses: DisplayCourse[];
  learningOverview: LearningOverview;
  recentViewedResources: LibraryResource[];
  libraryViewedCount: number;
  libraryFavoriteCount: number;
  createBackupPayload: () => AppBackupPayload;
  onRestoreBackup: (payload: AppBackupPayload) => void;
  onOpenCourse: (courseId: string) => void;
  onOpenResource: (resourceId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const latestPosts = communityPosts.slice(0, 2);
  const latestCourse = useMemo(() => continueLearningCourses[0] ?? null, [continueLearningCourses]);
  const learningArchive = useMemo(
    () =>
      [...displayCourses]
        .sort((left, right) => {
          const leftTime = left.runtime.lastStudiedAt ? new Date(left.runtime.lastStudiedAt).getTime() : 0;
          const rightTime = right.runtime.lastStudiedAt ? new Date(right.runtime.lastStudiedAt).getTime() : 0;
          return rightTime - leftTime;
        })
        .slice(0, 4),
    [displayCourses],
  );

  const handleStartEdit = () => {
    setDraft(profile);
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdateProfile(draft);
    setIsEditing(false);
  };

  const handleExportBackup = () => {
    const payload = createBackupPayload();

    downloadAppBackup(payload);
    setBackupError(null);
    setBackupNotice(`已导出学习存档：${new Date(payload.exportedAt).toLocaleString('zh-CN')}`);
  };

  const handleImportBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const payload = await parseAppBackupFile(file);
      onRestoreBackup(payload);
      setBackupError(null);
      setBackupNotice(`已从 ${file.name} 恢复学习存档。`);
    } catch (error) {
      setBackupNotice(null);
      setBackupError(error instanceof Error ? error.message : '导入失败，请检查备份文件。');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="profile-layout">
      <section className="content-card profile-hero-card">
        <div className="profile-identity">
          <div className="profile-avatar">EL</div>
          <div>
            <p className="eyebrow">Profile Recovery</p>
            <h2>{profile.name}</h2>
            <p className="profile-role">{profile.role}</p>
          </div>
        </div>
        <p className="hero-copy">{profile.bio}</p>
        <div className="profile-meta-list">
          <span>{profile.email}</span>
          <span>{profile.location}</span>
        </div>
        <div className="hero-actions">
          <button type="button" className="secondary-btn compact-btn" onClick={handleStartEdit}>
            编辑资料
          </button>
          {latestCourse && (
            <button type="button" className="primary-btn compact-btn" onClick={() => onOpenCourse(latestCourse.id)}>
              回到最近课程
            </button>
          )}
        </div>
      </section>

      {isEditing && (
        <section className="content-card profile-edit-card">
          <div className="module-header">
            <div>
              <p className="eyebrow">Edit Profile</p>
              <h2>资料编辑</h2>
            </div>
          </div>
          <div className="profile-form-grid">
            <label className="search-field" htmlFor="profile-name">
              <span>姓名</span>
              <input id="profile-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-role">
              <span>身份</span>
              <input id="profile-role" value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-email">
              <span>邮箱</span>
              <input id="profile-email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
            </label>
            <label className="search-field" htmlFor="profile-location">
              <span>位置</span>
              <input id="profile-location" value={draft.location} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} />
            </label>
            <label className="chat-input-field" htmlFor="profile-bio">
              <span>简介</span>
              <textarea
                id="profile-bio"
                rows={4}
                value={draft.bio}
                onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              />
            </label>
          </div>
          <div className="chat-input-actions">
            <button type="button" className="secondary-btn compact-btn" onClick={() => setIsEditing(false)}>
              取消
            </button>
            <button type="button" className="primary-btn compact-btn" onClick={handleSave}>
              保存资料
            </button>
          </div>
        </section>
      )}

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Backup Center</p>
            <h2>学习存档</h2>
          </div>
        </div>
        <p className="hero-copy">现在可以把课程进度、图书馆状态和个人资料导出成 JSON 备份，也可以从备份文件直接恢复。</p>
        <div className="hero-actions">
          <button type="button" className="secondary-btn compact-btn" onClick={handleExportBackup}>
            导出学习存档
          </button>
          <button type="button" className="primary-btn compact-btn" onClick={() => importInputRef.current?.click()}>
            导入学习存档
          </button>
        </div>
        <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportBackup} />
        <div className="detail-chip-row">
          <span className="post-badge">课程运行时 {displayCourses.length} 门</span>
          <span className="post-badge">资源已查看 {libraryViewedCount}</span>
          <span className="post-badge">资源已收藏 {libraryFavoriteCount}</span>
        </div>
        {backupNotice && <p className="backup-feedback">{backupNotice}</p>}
        {backupError && <p className="backup-feedback backup-feedback-error">{backupError}</p>}
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <span className="summary-label">进行中课程</span>
          <strong>{learningOverview.activeCourseCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已完成课时</span>
          <strong>{learningOverview.completedLessonCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">已读资料</span>
          <strong>{learningOverview.viewedMaterialCount}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">资源已查看</span>
          <strong>{libraryViewedCount}</strong>
        </article>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Snapshot</p>
            <h2>最近学习概览</h2>
          </div>
        </div>
        <div className="profile-highlight-grid">
          <article className="detail-summary-card">
            <span className="detail-summary-label">最近学习课程</span>
            <strong>{learningOverview.recentCourseTitle}</strong>
            <span>由课程运行时状态自动汇总</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">活跃模块</span>
            <strong>课程 / 校友圈</strong>
            <span>正在恢复真实可用的学习与社区链路</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">下一步</span>
            <strong>资料与社区联动</strong>
            <span>继续让个人资料和课程、动态、聊天数据保持同步</span>
          </article>
          <article className="detail-summary-card">
            <span className="detail-summary-label">资源收藏</span>
            <strong>{libraryFavoriteCount}</strong>
            <span>图书馆状态现在会同步进入个人中心概览</span>
          </article>
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Learning Archive</p>
            <h2>学习档案</h2>
          </div>
        </div>
        <div className="archive-list">
          {learningArchive.map((course) => (
            <button key={course.id} type="button" className="archive-item" onClick={() => onOpenCourse(course.id)}>
              <div>
                <p className="post-author">{course.title}</p>
                <p className="post-role">
                  {course.degree} · {course.instructor}
                </p>
              </div>
              <div className="archive-meta">
                <strong>{course.progressValue}%</strong>
                <span>{course.lastStudiedLabel}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Library Snapshot</p>
            <h2>资料阅读记录</h2>
          </div>
        </div>
        <div className="archive-list">
          {recentViewedResources.length > 0 ? (
            recentViewedResources.map((resource) => (
              <button key={resource.id} type="button" className="archive-item" onClick={() => onOpenResource(resource.id)}>
                <div>
                  <p className="post-author">{resource.title}</p>
                  <p className="post-role">
                    {resource.author} · {resource.format}
                  </p>
                </div>
                <div className="archive-meta">
                  <strong>{resource.updatedAt}</strong>
                  <span>{resource.relatedCourseId ? '已绑定相关课程资料' : '独立资源记录'}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>还没有最近查看资源</strong>
              <span>图书馆里的查看、下载和收藏状态会在这里汇总。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Recovery Timeline</p>
            <h2>恢复阶段记录</h2>
          </div>
        </div>
        <div className="timeline-list">
          {rebuildMilestones.map((milestone) => (
            <article key={milestone.title} className="timeline-item">
              <span className="timeline-step">{milestone.title}</span>
              <p>{milestone.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="continue-learning-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Continue Learning</p>
            <h2>继续学习</h2>
          </div>
        </div>
        <div className="continue-learning-grid">
          {continueLearningCourses.length > 0 ? (
            continueLearningCourses.map((course) => (
              <button key={course.id} type="button" className="continue-learning-item" onClick={() => onOpenCourse(course.id)}>
                <span className="continue-learning-title">{course.title}</span>
                <span className="continue-learning-subtitle">{course.recentLessonLabel}</span>
                <span className="continue-learning-meta">
                  {course.completedLessonsCount}/{course.syllabus.length} 课时完成 · {course.lastStudiedLabel}
                </span>
              </button>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>还没有最近学习记录</strong>
              <span>先从课程模块开始，运行时状态会自动同步到这里。</span>
            </div>
          )}
        </div>
      </section>

      <section className="content-card">
        <div className="module-header">
          <div>
            <p className="eyebrow">Community Sync</p>
            <h2>最近关联动态</h2>
          </div>
        </div>
        <div className="profile-feed-list">
          {latestPosts.map((post) => (
            <article className="profile-feed-item" key={post.id}>
              <div>
                <p className="post-author">{post.author}</p>
                <p className="post-role">{post.role}</p>
              </div>
              <span className="course-updated">{post.time}</span>
              <p className="post-content">{post.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
