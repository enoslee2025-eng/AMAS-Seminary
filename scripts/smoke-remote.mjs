import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(workspaceRoot, 'server', 'amas-api.mjs');
const port = Number(process.env.AMAS_API_PORT ?? '8788');
let cookieJar = '';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Ignore boot-time connection errors and retry.
    }

    await sleep(200);
  }

  throw new Error('AMAS local API did not become healthy in time.');
}

async function requestJson(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookieJar = setCookie.split(';', 1)[0];
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${body}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function expectFailure(baseUrl, pathname, expectedStatus, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(cookieJar ? { Cookie: cookieJar } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookieJar = setCookie.split(';', 1)[0];
  }

  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${pathname} should fail with ${expectedStatus}, got ${response.status}: ${body}`);
  }
}

async function main() {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'amas-api-smoke-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const apiProcess = spawn(process.execPath, [serverEntry], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AMAS_API_PORT: String(port),
      AMAS_API_DATA_DIR: tempDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let combinedLog = '';
  apiProcess.stdout.on('data', (chunk) => {
    combinedLog += chunk.toString();
  });
  apiProcess.stderr.on('data', (chunk) => {
    combinedLog += chunk.toString();
  });

  try {
    const health = await waitForHealth(baseUrl);
    assert(health.ok === true, 'Health endpoint should report ok=true.');

    const registerPayload = {
      account: 'demo@amas.local',
      password: '123456',
      degree: 'M.Div',
      displayName: 'Demo User',
      mode: 'register',
    };

    const session = await requestJson(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerPayload),
    });
    assert(session.account === registerPayload.account, 'Register should persist the normalized account.');
    assert(session.degree === registerPayload.degree, 'Register should return the selected degree.');
    assert(typeof session.expiresAt === 'string', 'Register should expose a session expiry timestamp.');
    assert(
      Date.parse(session.expiresAt) > Date.parse(session.lastAuthenticatedAt),
      'Register should return an expiry timestamp after authentication time.',
    );
    const activeSession = await requestJson(baseUrl, '/auth/session');
    assert(activeSession.account === registerPayload.account, 'Session probe should return the active account after register.');
    assert(typeof activeSession.expiresAt === 'string', 'Session probe should expose the current expiry timestamp.');
    await sleep(20);
    const refreshedSession = await requestJson(baseUrl, '/auth/refresh', {
      method: 'POST',
    });
    assert(refreshedSession.account === registerPayload.account, 'Session refresh should preserve the active account.');
    assert(
      Date.parse(refreshedSession.lastAuthenticatedAt) >= Date.parse(activeSession.lastAuthenticatedAt),
      'Session refresh should move the authentication timestamp forward.',
    );
    assert(
      Date.parse(refreshedSession.expiresAt) > Date.parse(activeSession.expiresAt),
      'Session refresh should extend the expiry timestamp.',
    );
    await expectFailure(baseUrl, '/auth/register', 409, {
      method: 'POST',
      body: JSON.stringify(registerPayload),
    });

    const updatedProfile = {
      name: 'Demo User',
      role: 'M.Div 学员',
      bio: '正在测试远端 API 冒烟链路。',
      email: registerPayload.account,
      location: 'Chiang Mai',
    };

    const savedProfile = await requestJson(baseUrl, '/profile', {
      method: 'PUT',
      body: JSON.stringify(updatedProfile),
    });
    assert(savedProfile.location === 'Chiang Mai', 'Profile update should persist location.');

    const courseRuntimePayload = {
      courseId: 'course-demo',
      source: 'manual',
      runtime: {
        currentLessonId: 'lesson-2',
        completedLessonIds: ['lesson-1'],
        viewedMaterialIds: ['material-1'],
        lastStudiedAt: '2026-03-18T08:00:00.000Z',
        lastOpenedTab: 'materials',
      },
    };

    const courseRuntime = await requestJson(baseUrl, `/learning/course-runtime/${courseRuntimePayload.courseId}`, {
      method: 'PUT',
      body: JSON.stringify(courseRuntimePayload),
    });
    assert(
      courseRuntime[courseRuntimePayload.courseId].currentLessonId === 'lesson-2',
      'Course runtime update should persist the current lesson.',
    );

    const libraryRuntimePayload = {
      resourceId: 'resource-demo',
      source: 'favorite',
      runtime: {
        favorite: true,
        viewed: true,
        progressPercent: 40,
        downloaded: false,
        lastViewedAt: '2026-03-18T08:05:00.000Z',
      },
    };

    const libraryRuntime = await requestJson(baseUrl, `/library/runtime/${libraryRuntimePayload.resourceId}`, {
      method: 'PUT',
      body: JSON.stringify(libraryRuntimePayload),
    });
    assert(
      libraryRuntime[libraryRuntimePayload.resourceId].favorite === true,
      'Library runtime update should persist favorites.',
    );
    assert(
      libraryRuntime[libraryRuntimePayload.resourceId].progressPercent === 40,
      'Library runtime update should persist reading progress.',
    );

    const snapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(snapshot.profile.bio === updatedProfile.bio, 'Sync snapshot should include the saved profile.');
    assert(
      snapshot.courseRuntime[courseRuntimePayload.courseId].viewedMaterialIds[0] === 'material-1',
      'Sync snapshot should include course runtime progress.',
    );
    assert(
      snapshot.libraryRuntime[libraryRuntimePayload.resourceId].viewed === true,
      'Sync snapshot should include library runtime state.',
    );
    assert(
      snapshot.libraryRuntime[libraryRuntimePayload.resourceId].progressPercent === 40,
      'Sync snapshot should include library reading progress.',
    );

    const communitySnapshot = await requestJson(baseUrl, '/sync/snapshot', {
      method: 'PUT',
      body: JSON.stringify({
        ...snapshot,
        posts: [
          {
            id: 'post-demo',
            author: 'Demo User',
            role: 'M.Div 学员',
            time: '刚刚',
            content: '远端快照需要保留社区恢复数据。',
            badge: '恢复记录',
            voiceRoomId: 'room-demo',
            voiceRoomTitle: 'Demo Voice Room',
            likes: 1,
            liked: true,
            comments: [],
          },
        ],
        conversations: [
          {
            id: 'conv-demo',
            name: '教务办公室',
            subtitle: '恢复远端社区快照',
            time: '刚刚',
            unread: 1,
            role: 'Admin',
            pinned: true,
            muted: false,
          },
        ],
        notifications: [
          {
            id: 'notice-demo',
            title: '社区快照已写入',
            detail: '这条通知用于验证快照写回。',
            time: '刚刚',
            type: 'system',
            read: false,
            postId: 'post-demo',
            conversationId: 'conv-demo',
            voiceRoomId: 'room-demo',
          },
        ],
        chatMessages: {
          'conv-demo': [
            {
              id: 'conv-demo-m1',
              sender: 'other',
              content: '这条消息用于验证聊天记录写回。',
              time: '刚刚',
            },
            {
              id: 'conv-demo-m2',
              sender: 'me',
              content: '邀请你加入语音房「Demo Voice Room」',
              time: '刚刚',
              type: 'voice_room_invite',
              voiceRoomId: 'room-demo',
              voiceRoomTitle: 'Demo Voice Room',
              voiceRoomSummary: '这间房用于验证语音房快照写回。',
              voiceRoomTopic: '课程复盘',
            },
            {
              id: 'conv-demo-m3',
              sender: 'me',
              content: '会后摘要：Demo Voice Room 已完成讨论',
              time: '刚刚',
              type: 'voice_room_recap',
              voiceRoomId: 'room-demo',
              voiceRoomTitle: 'Demo Voice Room',
              voiceRoomSummary: '这间房用于验证语音房会后摘要回流。',
              voiceRoomTopic: '课程复盘',
              voiceRoomRecapHeadline: 'Demo Voice Room 已完成讨论',
              voiceRoomRecapHighlights: ['共有 3 人参与本轮演示讨论。'],
            },
          ],
        },
        voiceRooms: [
          {
            id: 'room-demo',
            title: 'Demo Voice Room',
            summary: '这间房用于验证语音房快照写回。',
            topic: '课程复盘',
            status: 'live',
            joinPolicy: 'approval',
            time: '刚刚',
            hostName: 'Demo User',
            joined: true,
            speakerCount: 1,
            participantCount: 3,
            joinRequests: [
              {
                id: 'room-demo-join-1',
                name: 'Queued Guest',
                badge: 'Pending Listener',
                time: '刚刚',
              },
            ],
            speakerRequestMemberIds: ['room-demo-member-2'],
            activity: [
              {
                id: 'room-demo-activity-1',
                type: 'system',
                title: '演示房已创建',
                detail: '这条记录用于验证房间活动时间线写回。',
                time: '刚刚',
              },
            ],
            recapPostId: 'post-demo-recap',
            recapConversationIds: ['conv-demo'],
            members: [
              {
                id: 'room-demo-member-1',
                name: 'Demo User',
                badge: '主持',
                role: 'host',
                state: 'speaking',
                presence: 'online',
                isLocal: true,
              },
              {
                id: 'room-demo-member-2',
                name: 'Guest User',
                badge: 'Listener',
                role: 'listener',
                state: 'listening',
                presence: 'reconnecting',
              },
            ],
          },
        ],
      }),
    });
    assert(communitySnapshot.posts[0]?.id === 'post-demo', 'Sync snapshot writes should persist community posts.');
    assert(
      communitySnapshot.posts[0]?.voiceRoomId === 'room-demo',
      'Sync snapshot writes should preserve voice room links on community posts.',
    );
    assert(
      communitySnapshot.conversations[0]?.id === 'conv-demo',
      'Sync snapshot writes should persist community conversations.',
    );
    assert(
      communitySnapshot.notifications[0]?.id === 'notice-demo',
      'Sync snapshot writes should persist community notifications.',
    );
    assert(
      communitySnapshot.chatMessages['conv-demo']?.[0]?.id === 'conv-demo-m1',
      'Sync snapshot writes should persist community chat messages.',
    );
    assert(
      communitySnapshot.chatMessages['conv-demo']?.[1]?.type === 'voice_room_invite',
      'Sync snapshot writes should preserve voice room invite chat messages.',
    );
    assert(
      communitySnapshot.chatMessages['conv-demo']?.[2]?.type === 'voice_room_recap',
      'Sync snapshot writes should preserve voice room recap chat messages.',
    );
    assert(communitySnapshot.voiceRooms[0]?.id === 'room-demo', 'Sync snapshot writes should persist community voice rooms.');
    assert(
      communitySnapshot.voiceRooms[0]?.speakerRequestMemberIds?.[0] === 'room-demo-member-2',
      'Sync snapshot writes should preserve voice room speaker request queues.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.joinPolicy === 'approval',
      'Sync snapshot writes should preserve voice room join policies.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.joinRequests?.[0]?.name === 'Queued Guest',
      'Sync snapshot writes should preserve voice room join approval queues.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.members?.[1]?.presence === 'reconnecting',
      'Sync snapshot writes should preserve voice room member presence states.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.activity?.[0]?.title === '演示房已创建',
      'Sync snapshot writes should preserve voice room activity timeline records.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.recapPostId === 'post-demo-recap',
      'Sync snapshot writes should preserve voice room recap feed share state.',
    );
    assert(
      communitySnapshot.voiceRooms[0]?.recapConversationIds?.[0] === 'conv-demo',
      'Sync snapshot writes should preserve voice room recap conversation share state.',
    );

    await requestJson(baseUrl, '/auth/logout', {
      method: 'POST',
    });
    const signedOutSession = await requestJson(baseUrl, '/auth/session');
    assert(signedOutSession === null, 'Logout should clear the current auth session.');
    const signedOutSnapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(signedOutSnapshot.authSession === null, 'Logout should clear the auth session.');
    await expectFailure(baseUrl, '/profile', 401, {
      method: 'PUT',
      body: JSON.stringify(updatedProfile),
    });
    await expectFailure(baseUrl, '/sync/snapshot', 401, {
      method: 'PUT',
      body: JSON.stringify({
        ...snapshot,
        authSession: session,
      }),
    });
    await expectFailure(baseUrl, '/auth/login', 401, {
      method: 'POST',
      body: JSON.stringify({
        ...registerPayload,
        password: 'wrong-password',
        mode: 'login',
      }),
    });
    const reloginSession = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...registerPayload,
        mode: 'login',
      }),
    });
    assert(reloginSession.account === registerPayload.account, 'Login should accept the registered account.');
    assert(typeof reloginSession.expiresAt === 'string', 'Login should expose a refreshed expiry timestamp.');
    const reloginProbe = await requestJson(baseUrl, '/auth/session');
    assert(reloginProbe.account === registerPayload.account, 'Session probe should return the active account after login.');
    assert(
      Date.parse(reloginProbe.expiresAt) >= Date.parse(reloginSession.lastAuthenticatedAt),
      'Session probe should keep the refreshed expiry timestamp after login.',
    );
    const firstUserSnapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(firstUserSnapshot.profile.location === 'Chiang Mai', 'First account should keep its own profile data.');
    assert(
      firstUserSnapshot.courseRuntime[courseRuntimePayload.courseId].currentLessonId === 'lesson-2',
      'First account should keep its own course runtime.',
    );

    await requestJson(baseUrl, '/auth/logout', {
      method: 'POST',
    });

    const secondRegisterPayload = {
      account: 'second@amas.local',
      password: 'abcdef',
      degree: 'B.Th',
      displayName: 'Second User',
      mode: 'register',
    };

    await requestJson(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify(secondRegisterPayload),
    });
    await requestJson(baseUrl, '/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Second User',
        role: 'B.Th 学员',
        bio: '第二个账号的远端工作区。',
        email: secondRegisterPayload.account,
        location: 'Seoul',
      }),
    });
    await requestJson(baseUrl, `/learning/course-runtime/${courseRuntimePayload.courseId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...courseRuntimePayload,
        runtime: {
          ...courseRuntimePayload.runtime,
          currentLessonId: 'lesson-9',
          completedLessonIds: ['lesson-8', 'lesson-9'],
        },
      }),
    });

    await requestJson(baseUrl, '/auth/logout', {
      method: 'POST',
    });
    await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...registerPayload,
        mode: 'login',
      }),
    });
    const isolatedFirstUserSnapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(isolatedFirstUserSnapshot.profile.location === 'Chiang Mai', 'Second account should not overwrite first account profile.');
    assert(
      isolatedFirstUserSnapshot.courseRuntime[courseRuntimePayload.courseId].currentLessonId === 'lesson-2',
      'Second account should not overwrite first account course runtime.',
    );

    await requestJson(baseUrl, '/auth/logout', {
      method: 'POST',
    });
    await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...secondRegisterPayload,
        mode: 'login',
      }),
    });
    const secondUserSnapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(secondUserSnapshot.profile.location === 'Seoul', 'Second account should read its own profile data.');
    assert(
      secondUserSnapshot.courseRuntime[courseRuntimePayload.courseId].currentLessonId === 'lesson-9',
      'Second account should read its own course runtime.',
    );

    console.log('Remote smoke checks passed: health, register, auth validation, per-account isolation, full snapshot sync, logout.');
  } catch (error) {
    console.error('Remote smoke checks failed.');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nAPI log:\n');
    console.error(combinedLog.trim());
    throw error;
  } finally {
    apiProcess.kill('SIGTERM');
    await sleep(150);
    const exitCode = apiProcess.exitCode;

    if (exitCode === null) {
      apiProcess.kill('SIGKILL');
    }
    await rm(tempDataDir, { recursive: true, force: true });
  }
}

main().catch(() => {
  process.exitCode = 1;
});
