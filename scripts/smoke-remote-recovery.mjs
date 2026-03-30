import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(workspaceRoot, 'server', 'amas-api.mjs');
const port = Number(process.env.AMAS_API_PORT ?? '8789');
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
        return;
      }
    } catch {
      // Retry until server is ready.
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

function startApi(tempDataDir) {
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

  return {
    baseUrl,
    apiProcess,
    getLog: () => combinedLog.trim(),
  };
}

async function stopApi(apiProcess) {
  apiProcess.kill('SIGTERM');
  await sleep(150);
  if (apiProcess.exitCode === null) {
    apiProcess.kill('SIGKILL');
  }
}

async function main() {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'amas-api-recovery-'));
  const firstRun = startApi(tempDataDir);

  try {
    await waitForHealth(firstRun.baseUrl);

    await requestJson(firstRun.baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        account: 'seed@amas.local',
        password: '123456',
        degree: 'B.Th',
        displayName: 'Seed User',
        mode: 'register',
      }),
    });

    const seededSnapshot = {
      version: 1,
      authSession: {
        account: 'seed@amas.local',
        role: 'student',
        degree: 'B.Th',
        lastAuthenticatedAt: '2026-03-18T09:00:00.000Z',
      },
      profile: {
        name: 'Seed User',
        role: 'B.Th 学员',
        bio: '初始远端快照。',
        email: 'seed@amas.local',
        location: 'Bangkok',
      },
      courseRuntime: {
        'course-seed': {
          currentLessonId: 'lesson-a',
          completedLessonIds: ['lesson-a'],
          viewedMaterialIds: ['material-a'],
          lastStudiedAt: '2026-03-18T09:05:00.000Z',
          lastOpenedTab: 'syllabus',
        },
      },
      libraryRuntime: {
        'resource-seed': {
          favorite: true,
          viewed: true,
          progressPercent: 30,
          downloaded: false,
          lastViewedAt: '2026-03-18T09:06:00.000Z',
        },
      },
      posts: [
        {
          id: 'post-seed',
          author: 'Seed User',
          role: 'B.Th 学员',
          time: '刚刚',
          content: '初始社区恢复快照。',
          badge: '恢复记录',
          voiceRoomId: 'room-seed',
          voiceRoomTitle: '初始语音房',
          likes: 0,
          liked: false,
          comments: [],
        },
      ],
      conversations: [
        {
          id: 'conv-seed',
          name: 'Seed Mentor',
          subtitle: '初始社区会话',
          time: '刚刚',
          unread: 1,
          role: 'Mentor',
          pinned: false,
          muted: false,
        },
      ],
      notifications: [
        {
          id: 'notice-seed',
          title: '初始社区提醒',
          detail: '验证重启后的社区快照保留。',
          time: '刚刚',
          type: 'system',
          read: false,
          postId: 'post-seed',
          conversationId: 'conv-seed',
        },
      ],
      chatMessages: {
        'conv-seed': [
          {
            id: 'conv-seed-m1',
            sender: 'other',
            content: '这是初始的社区聊天记录。',
            time: '刚刚',
          },
          {
            id: 'conv-seed-m2',
            sender: 'me',
            content: '邀请你加入语音房「初始语音房」',
            time: '刚刚',
            type: 'voice_room_invite',
            voiceRoomId: 'room-seed',
            voiceRoomTitle: '初始语音房',
            voiceRoomSummary: '验证重启后的语音房快照保留。',
            voiceRoomTopic: '导师答疑',
          },
          {
            id: 'conv-seed-m3',
            sender: 'me',
            content: '会后摘要：初始语音房已完成讨论',
            time: '刚刚',
            type: 'voice_room_recap',
            voiceRoomId: 'room-seed',
            voiceRoomTitle: '初始语音房',
            voiceRoomSummary: '验证重启后的会后摘要消息保留。',
            voiceRoomTopic: '导师答疑',
            voiceRoomRecapHeadline: '初始语音房已完成讨论',
            voiceRoomRecapHighlights: ['共有 4 人参与本轮初始讨论。'],
          },
        ],
      },
      voiceRooms: [
        {
          id: 'room-seed',
          title: '初始语音房',
          summary: '验证重启后的语音房快照保留。',
          topic: '导师答疑',
          status: 'live',
          joinPolicy: 'approval',
          time: '刚刚',
          hostName: 'Seed Mentor',
          joined: false,
          speakerCount: 1,
          participantCount: 4,
          joinRequests: [
            {
              id: 'room-seed-join-1',
              name: 'Queued Seed User',
              badge: 'Pending Student',
              time: '刚刚',
            },
          ],
          speakerRequestMemberIds: ['room-seed-member-2'],
          activity: [
            {
              id: 'room-seed-activity-1',
              type: 'system',
              title: '种子房已创建',
              detail: '验证重启后的房间活动时间线保留。',
              time: '刚刚',
            },
          ],
          recapPostId: 'post-seed-recap',
          recapConversationIds: ['conv-seed'],
          members: [
            {
              id: 'room-seed-member-1',
              name: 'Seed Mentor',
              badge: '主持',
              role: 'host',
              state: 'speaking',
              presence: 'reconnecting',
            },
            {
              id: 'room-seed-member-2',
              name: 'Seed Listener',
              badge: 'Listener',
              role: 'listener',
              state: 'listening',
              presence: 'away',
            },
          ],
        },
      ],
    };

    await requestJson(firstRun.baseUrl, '/sync/snapshot', {
      method: 'PUT',
      body: JSON.stringify(seededSnapshot),
    });
    await stopApi(firstRun.apiProcess);

    const secondRun = startApi(tempDataDir);

    try {
      await waitForHealth(secondRun.baseUrl);

      const restartedSnapshot = await requestJson(secondRun.baseUrl, '/sync/snapshot');
      assert(restartedSnapshot.profile.name === 'Seed User', 'Restart should preserve the saved remote snapshot.');
      assert(
        restartedSnapshot.courseRuntime['course-seed'].currentLessonId === 'lesson-a',
        'Restart should preserve remote course runtime.',
      );
      assert(restartedSnapshot.posts[0]?.id === 'post-seed', 'Restart should preserve remote community posts.');
      assert(
        restartedSnapshot.posts[0]?.voiceRoomId === 'room-seed',
        'Restart should preserve remote voice room links on community posts.',
      );
      assert(
        restartedSnapshot.conversations[0]?.id === 'conv-seed',
        'Restart should preserve remote community conversations.',
      );
      assert(
        restartedSnapshot.chatMessages['conv-seed']?.[0]?.id === 'conv-seed-m1',
        'Restart should preserve remote community chat history.',
      );
      assert(
        restartedSnapshot.chatMessages['conv-seed']?.[1]?.type === 'voice_room_invite',
        'Restart should preserve remote voice room invite chat history.',
      );
      assert(
        restartedSnapshot.chatMessages['conv-seed']?.[2]?.type === 'voice_room_recap',
        'Restart should preserve remote voice room recap chat history.',
      );
      assert(restartedSnapshot.voiceRooms[0]?.id === 'room-seed', 'Restart should preserve remote community voice rooms.');
      assert(
        restartedSnapshot.voiceRooms[0]?.speakerRequestMemberIds?.[0] === 'room-seed-member-2',
        'Restart should preserve remote voice room speaker request queues.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.joinPolicy === 'approval',
        'Restart should preserve remote voice room join policies.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.joinRequests?.[0]?.name === 'Queued Seed User',
        'Restart should preserve remote voice room join approval queues.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.members?.[0]?.presence === 'reconnecting',
        'Restart should preserve remote voice room member presence states.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.activity?.[0]?.title === '种子房已创建',
        'Restart should preserve remote voice room activity timeline records.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.recapPostId === 'post-seed-recap',
        'Restart should preserve remote voice room recap feed share state.',
      );
      assert(
        restartedSnapshot.voiceRooms[0]?.recapConversationIds?.[0] === 'conv-seed',
        'Restart should preserve remote voice room recap conversation share state.',
      );

      const recoveredSnapshot = {
        ...restartedSnapshot,
        authSession: {
          account: 'seed@amas.local',
          role: 'student',
          degree: 'B.Th',
          lastAuthenticatedAt: '2026-03-18T09:30:00.000Z',
        },
        profile: {
          ...restartedSnapshot.profile,
          name: 'Recovered User',
          role: 'B.Th 学员',
          email: 'seed@amas.local',
          bio: '来自本地离线工作区的恢复写回。',
        },
        courseRuntime: {
          ...restartedSnapshot.courseRuntime,
          'course-seed': {
            ...restartedSnapshot.courseRuntime['course-seed'],
            currentLessonId: 'lesson-b',
            completedLessonIds: ['lesson-a', 'lesson-b'],
          },
        },
        libraryRuntime: {
          ...restartedSnapshot.libraryRuntime,
          'resource-seed': {
            ...restartedSnapshot.libraryRuntime['resource-seed'],
            progressPercent: 85,
            downloaded: true,
          },
        },
        posts: [
          ...restartedSnapshot.posts,
          {
            id: 'post-recovered',
            author: 'Recovered User',
            role: 'B.Th 学员',
            time: '刚刚',
            content: '离线期间补写的社区动态。',
            badge: '课程感悟',
            voiceRoomId: 'room-seed',
            voiceRoomTitle: '恢复后的语音房',
            likes: 2,
            liked: true,
            comments: [],
          },
        ],
        conversations: restartedSnapshot.conversations.map((conversation) =>
          conversation.id === 'conv-seed'
            ? {
                ...conversation,
                subtitle: '恢复后的社区会话',
                unread: 0,
              }
            : conversation,
        ),
        notifications: [
          {
            id: 'notice-recovered',
            title: '恢复后的社区提醒',
            detail: '验证快照写回会覆盖社区提醒。',
            time: '刚刚',
            type: 'system',
            read: false,
            postId: 'post-recovered',
            conversationId: 'conv-seed',
          },
        ],
        chatMessages: {
          'conv-seed': [
            ...restartedSnapshot.chatMessages['conv-seed'],
            {
              id: 'conv-seed-m4',
              sender: 'me',
              content: '这是离线恢复后补写回远端的消息。',
              time: '刚刚',
            },
          ],
        },
        voiceRooms: [
          {
            ...restartedSnapshot.voiceRooms[0],
            title: '恢复后的语音房',
            participantCount: 7,
            joined: true,
            joinPolicy: 'open',
            joinRequests: [
              {
                id: 'room-recovered-join-1',
                name: 'Recovered Guest',
                badge: 'Restored Listener',
                time: '刚刚',
              },
            ],
            members: restartedSnapshot.voiceRooms[0].members.map((member) =>
              member.id === 'room-seed-member-1'
                ? {
                    ...member,
                    presence: 'online',
                  }
                : member
            ),
            activity: [
              {
                id: 'room-seed-activity-2',
                type: 'moderation',
                title: '恢复后已接手主持',
                detail: '离线恢复期间，这间房的主持控制已被重新接手。',
                time: '刚刚',
              },
              ...(restartedSnapshot.voiceRooms[0].activity ?? []),
            ],
            recapPostId: 'post-recovered-recap',
            recapConversationIds: ['conv-seed', 'conv-archive'],
            recap: {
              headline: '恢复后的语音房已完成讨论',
              highlights: ['共有 7 人参与本轮恢复讨论。'],
              generatedAt: '2026-03-18 09:45',
            },
          },
        ],
      };

      await requestJson(secondRun.baseUrl, '/sync/snapshot', {
        method: 'PUT',
        body: JSON.stringify(recoveredSnapshot),
      });
      const finalSnapshot = await requestJson(secondRun.baseUrl, '/sync/snapshot');
      assert(finalSnapshot.profile.name === 'Recovered User', 'Recovered snapshot should overwrite the remote profile.');
      assert(
        finalSnapshot.courseRuntime['course-seed'].completedLessonIds.length === 2,
        'Recovered snapshot should overwrite remote course progress.',
      );
      assert(
        finalSnapshot.libraryRuntime['resource-seed'].downloaded === true,
        'Recovered snapshot should overwrite remote library state.',
      );
      assert(
        finalSnapshot.libraryRuntime['resource-seed'].progressPercent === 85,
        'Recovered snapshot should overwrite remote library reading progress.',
      );
      assert(finalSnapshot.posts.length === 2, 'Recovered snapshot should overwrite remote community posts.');
      assert(
        finalSnapshot.posts[1]?.voiceRoomId === 'room-seed',
        'Recovered snapshot should overwrite remote voice room links on community posts.',
      );
      assert(
        finalSnapshot.conversations[0]?.subtitle === '恢复后的社区会话',
        'Recovered snapshot should overwrite remote community conversations.',
      );
      assert(
        finalSnapshot.notifications[0]?.id === 'notice-recovered',
        'Recovered snapshot should overwrite remote community notifications.',
      );
      assert(
        finalSnapshot.chatMessages['conv-seed']?.length === 4,
        'Recovered snapshot should overwrite remote community chat history.',
      );
      assert(finalSnapshot.voiceRooms[0]?.title === '恢复后的语音房', 'Recovered snapshot should overwrite remote community voice rooms.');
      assert(
        finalSnapshot.voiceRooms[0]?.recap?.headline === '恢复后的语音房已完成讨论',
        'Recovered snapshot should overwrite remote voice room recap data.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.members?.[0]?.presence === 'online',
        'Recovered snapshot should overwrite remote voice room member presence states.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.joinPolicy === 'open',
        'Recovered snapshot should overwrite remote voice room join policies.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.joinRequests?.[0]?.name === 'Recovered Guest',
        'Recovered snapshot should overwrite remote voice room join approval queues.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.activity?.[0]?.title === '恢复后已接手主持',
        'Recovered snapshot should overwrite remote voice room activity timeline records.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.recapPostId === 'post-recovered-recap',
        'Recovered snapshot should overwrite remote voice room recap feed share state.',
      );
      assert(
        finalSnapshot.voiceRooms[0]?.recapConversationIds?.[1] === 'conv-archive',
        'Recovered snapshot should overwrite remote voice room recap conversation share state.',
      );

      console.log('Remote recovery smoke checks passed: restart persistence and full snapshot recovery write-back.');
    } catch (error) {
      console.error('Remote recovery smoke checks failed.');
      console.error(error instanceof Error ? error.message : error);
      console.error('\nAPI log:\n');
      console.error(secondRun.getLog());
      throw error;
    } finally {
      await stopApi(secondRun.apiProcess);
    }
  } catch (error) {
    console.error('Remote recovery smoke checks failed.');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nAPI log:\n');
    console.error(firstRun.getLog());
    throw error;
  } finally {
    if (firstRun.apiProcess.exitCode === null) {
      await stopApi(firstRun.apiProcess);
    }
    await rm(tempDataDir, { recursive: true, force: true });
  }
}

main().catch(() => {
  process.exitCode = 1;
});
