import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = Number(process.env.AMAS_API_PORT ?? '8787');
const dataDir = process.env.AMAS_API_DATA_DIR
  ? path.resolve(__dirname, process.env.AMAS_API_DATA_DIR)
  : path.join(__dirname, 'data');
const snapshotFile = path.join(dataDir, 'app-domain-snapshot.json');
const professorApplicationsFile = path.join(dataDir, 'professor-applications.json');
const usersFile = path.join(dataDir, 'auth-users.json');
const sessionsFile = path.join(dataDir, 'auth-sessions.json');
const anonymousAccount = '__anonymous__';
const sessionTtlMs = Number(process.env.AMAS_API_SESSION_TTL_MS ?? `${1000 * 60 * 60 * 12}`);

function createDefaultSnapshot() {
  return {
    version: 1,
    authSession: null,
    profile: {
      name: 'AMAS 学员',
      role: '亚洲宣教神学院 学员',
      bio: '愿主带领每一次学习与差传回应。',
      email: '',
      location: 'Bangkok',
    },
    courseRuntime: {},
    libraryRuntime: {},
    posts: [],
    conversations: [],
    notifications: [],
    chatMessages: {},
    voiceRooms: [],
  };
}

function createWorkspaceState() {
  return {
    version: 1,
    snapshotsByAccount: {},
  };
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function emptyResponse(response, statusCode = 204) {
  response.writeHead(statusCode);
  response.end();
}

function sendError(response, statusCode, message) {
  jsonResponse(response, statusCode, {
    error: message,
  });
}

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await ensureDataDir();
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

async function appendProfessorApplication(payload) {
  const current = await readJsonFile(professorApplicationsFile, []);
  const next = Array.isArray(current) ? current : [];
  next.push(payload);
  await writeJsonFile(professorApplicationsFile, next);
}

async function readUsers() {
  const users = await readJsonFile(usersFile, []);
  return Array.isArray(users) ? users : [];
}

async function saveUsers(users) {
  return writeJsonFile(usersFile, users);
}

async function readSessions() {
  const sessions = await readJsonFile(sessionsFile, {});
  return isRecord(sessions) ? sessions : {};
}

async function saveSessions(sessions) {
  return writeJsonFile(sessionsFile, sessions);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeStoredSnapshot(snapshot, overrides = {}) {
  const fallback = createDefaultSnapshot();
  return {
    ...fallback,
    ...(isRecord(snapshot) ? snapshot : {}),
    authSession: null,
    profile: {
      ...fallback.profile,
      ...(isRecord(snapshot?.profile) ? snapshot.profile : {}),
      ...(isRecord(overrides.profile) ? overrides.profile : {}),
    },
    courseRuntime: isRecord(snapshot?.courseRuntime) ? snapshot.courseRuntime : fallback.courseRuntime,
    libraryRuntime: isRecord(snapshot?.libraryRuntime) ? snapshot.libraryRuntime : fallback.libraryRuntime,
    posts: Array.isArray(snapshot?.posts) ? snapshot.posts : fallback.posts,
    conversations: Array.isArray(snapshot?.conversations) ? snapshot.conversations : fallback.conversations,
    notifications: Array.isArray(snapshot?.notifications) ? snapshot.notifications : fallback.notifications,
    chatMessages: isRecord(snapshot?.chatMessages) ? snapshot.chatMessages : fallback.chatMessages,
    voiceRooms: Array.isArray(snapshot?.voiceRooms) ? snapshot.voiceRooms : fallback.voiceRooms,
  };
}

function createDefaultUserSnapshot(user) {
  const fallback = createDefaultSnapshot();
  if (!user) {
    return fallback;
  }

  return normalizeStoredSnapshot(fallback, {
    profile: {
      name: user.displayName,
      role: `${user.degree} 学员`,
      email: user.account,
    },
  });
}

async function readWorkspaceState() {
  const raw = await readJsonFile(snapshotFile, null);
  if (!raw) {
    return createWorkspaceState();
  }

  if (isRecord(raw) && isRecord(raw.snapshotsByAccount)) {
    return {
      version: 1,
      snapshotsByAccount: Object.fromEntries(
        Object.entries(raw.snapshotsByAccount).map(([account, snapshot]) => [account, normalizeStoredSnapshot(snapshot)]),
      ),
    };
  }

  const legacySnapshot = normalizeStoredSnapshot(raw);
  const legacyAccount = typeof raw?.authSession?.account === 'string' ? raw.authSession.account : anonymousAccount;

  return {
    version: 1,
    snapshotsByAccount: {
      [legacyAccount]: normalizeStoredSnapshot(legacySnapshot, {
        profile: {
          email: legacyAccount === anonymousAccount ? legacySnapshot.profile.email : legacyAccount,
        },
      }),
    },
  };
}

async function saveWorkspaceState(workspaceState) {
  return writeJsonFile(snapshotFile, {
    version: 1,
    snapshotsByAccount: workspaceState.snapshotsByAccount,
  });
}

function getRequestOrigin(request) {
  return request.headers.origin ?? 'http://127.0.0.1:5173';
}

function applyCorsHeaders(request, response) {
  response.setHeader('Access-Control-Allow-Origin', getRequestOrigin(request));
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
}

function parseCookies(headerValue = '') {
  return Object.fromEntries(
    headerValue
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((entry) => {
        const separatorIndex = entry.indexOf('=');
        if (separatorIndex === -1) {
          return [entry, ''];
        }

        return [entry.slice(0, separatorIndex), decodeURIComponent(entry.slice(separatorIndex + 1))];
      }),
  );
}

function buildSessionCookie(sessionId) {
  return `amas_session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function buildClearedSessionCookie() {
  return 'amas_session_id=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function hasValidSessionTimestamp(session) {
  const timestamp = Date.parse(typeof session?.lastAuthenticatedAt === 'string' ? session.lastAuthenticatedAt : '');
  return Number.isFinite(timestamp);
}

function buildSessionExpiryTimestamp(lastAuthenticatedAt) {
  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 0) {
    return null;
  }

  const authenticatedAt = Date.parse(lastAuthenticatedAt);
  if (!Number.isFinite(authenticatedAt)) {
    return null;
  }

  return new Date(authenticatedAt + sessionTtlMs).toISOString();
}

function normalizeAuthSession(session) {
  if (!isRecord(session) || typeof session.account !== 'string' || typeof session.lastAuthenticatedAt !== 'string') {
    return null;
  }

  return {
    ...session,
    expiresAt: buildSessionExpiryTimestamp(session.lastAuthenticatedAt),
  };
}

function isSessionExpired(session) {
  if (!Number.isFinite(sessionTtlMs) || sessionTtlMs < 0) {
    return false;
  }

  if (!hasValidSessionTimestamp(session)) {
    return false;
  }

  const authenticatedAt = Date.parse(session.lastAuthenticatedAt);
  return Date.now() - authenticatedAt >= sessionTtlMs;
}

function applyClearedSessionCookieIfNeeded(response, sessionContext) {
  if (sessionContext?.shouldClearCookie) {
    response.setHeader('Set-Cookie', buildClearedSessionCookie());
  }
}

function requireAuthenticatedSession(response, session) {
  if (session) {
    return true;
  }

  sendError(response, 401, 'Authentication required.');
  return false;
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return null;
  }

  return JSON.parse(raw);
}

function buildAuthSession(payload) {
  const lastAuthenticatedAt = new Date().toISOString();
  return {
    account: payload.account.trim(),
    role: 'student',
    degree: payload.degree,
    lastAuthenticatedAt,
    expiresAt: buildSessionExpiryTimestamp(lastAuthenticatedAt),
  };
}

function refreshAuthSession(session) {
  const lastAuthenticatedAt = new Date().toISOString();
  return {
    ...session,
    lastAuthenticatedAt,
    expiresAt: buildSessionExpiryTimestamp(lastAuthenticatedAt),
  };
}

function buildProfileRole(snapshot, payload) {
  if (payload.mode === 'register' || snapshot.profile.role === '亚洲宣教神学院 学员') {
    return `${payload.degree} 学员`;
  }

  return snapshot.profile.role;
}

function findUser(users, account) {
  const normalizedAccount = account.trim();
  return users.find((user) => user.account === normalizedAccount) ?? null;
}

function getSnapshotForAccount(workspaceState, account, user = null) {
  if (!account) {
    return normalizeStoredSnapshot(createDefaultSnapshot());
  }

  return normalizeStoredSnapshot(workspaceState.snapshotsByAccount[account] ?? createDefaultUserSnapshot(user), {
    profile: user
      ? {
          name: user.displayName,
          role: `${user.degree} 学员`,
          email: user.account,
        }
      : undefined,
  });
}

function buildResponseSnapshot(workspaceState, account, user = null, session = null) {
  const snapshot = getSnapshotForAccount(workspaceState, account, user);
  return {
    ...snapshot,
    authSession: session ?? null,
  };
}

function persistAccountSnapshot(workspaceState, account, snapshot, user = null) {
  const targetAccount = account ?? anonymousAccount;
  const normalizedSnapshot = getSnapshotForAccount(
    {
      ...workspaceState,
      snapshotsByAccount: {
        ...workspaceState.snapshotsByAccount,
        [targetAccount]: snapshot,
      },
    },
    targetAccount,
    user,
  );

  return {
    ...workspaceState,
    snapshotsByAccount: {
      ...workspaceState.snapshotsByAccount,
      [targetAccount]: normalizedSnapshot,
    },
  };
}

async function getRequestSessionContext(request) {
  const sessions = await readSessions();
  const cookies = parseCookies(request.headers.cookie ?? '');
  const sessionId = cookies.amas_session_id ?? null;
  let session = sessionId && isRecord(sessions[sessionId]) ? sessions[sessionId] : null;
  let shouldClearCookie = Boolean(sessionId) && !session;

  if (sessionId && session && isSessionExpired(session)) {
    delete sessions[sessionId];
    await saveSessions(sessions);
    session = null;
    shouldClearCookie = true;
  }

  return {
    sessionId,
    session: session ? normalizeAuthSession(session) : null,
    sessions,
    shouldClearCookie,
  };
}

const server = createServer(async (request, response) => {
  applyCorsHeaders(request, response);

  if (request.method === 'OPTIONS') {
    emptyResponse(response);
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const pathname = url.pathname;

  try {
    if (request.method === 'GET' && pathname === '/health') {
      jsonResponse(response, 200, {
        ok: true,
        mode: 'local-api',
        port,
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/auth/login') {
      const payload = await readRequestBody(request);
      if (!payload?.account || !payload?.password || !payload?.degree) {
        sendError(response, 400, 'Missing account, password, or degree.');
        return;
      }

      const users = await readUsers();
      const user = findUser(users, payload.account);
      if (!user || user.password !== payload.password) {
        sendError(response, 401, 'Invalid account or password.');
        return;
      }

      const workspaceState = await readWorkspaceState();
      const { sessions } = await getRequestSessionContext(request);
      const nextSession = buildAuthSession({
        account: user.account,
        degree: user.degree,
      });
      const nextSessionId = randomUUID();
      const nextWorkspaceState = {
        ...persistAccountSnapshot(workspaceState, user.account, getSnapshotForAccount(workspaceState, user.account, user), user),
      };

      await saveSessions({
        ...sessions,
        [nextSessionId]: nextSession,
      });
      await saveWorkspaceState(nextWorkspaceState);
      response.setHeader('Set-Cookie', buildSessionCookie(nextSessionId));
      jsonResponse(response, 200, nextSession);
      return;
    }

    if (request.method === 'GET' && pathname === '/auth/session') {
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      jsonResponse(response, 200, session ?? null);
      return;
    }

    if (request.method === 'POST' && pathname === '/auth/refresh') {
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { sessionId, session, sessions } = sessionContext;
      if (!requireAuthenticatedSession(response, session) || !sessionId) {
        return;
      }

      const nextSession = refreshAuthSession(session);
      await saveSessions({
        ...sessions,
        [sessionId]: nextSession,
      });
      response.setHeader('Set-Cookie', buildSessionCookie(sessionId));
      jsonResponse(response, 200, nextSession);
      return;
    }

    if (request.method === 'POST' && pathname === '/auth/register') {
      const payload = await readRequestBody(request);
      if (!payload?.account || !payload?.password || !payload?.degree) {
        sendError(response, 400, 'Missing account, password, or degree.');
        return;
      }

      const users = await readUsers();
      if (findUser(users, payload.account)) {
        sendError(response, 409, 'Account already exists.');
        return;
      }

      const workspaceState = await readWorkspaceState();
      const { sessions } = await getRequestSessionContext(request);
      const nextSession = buildAuthSession(payload);
      const nextSessionId = randomUUID();
      const nextUsers = [
        ...users,
        {
          account: payload.account.trim(),
          password: payload.password,
          degree: payload.degree,
          displayName: payload.displayName?.trim() || payload.account.trim(),
          createdAt: new Date().toISOString(),
        },
      ];
      const nextUser = nextUsers[nextUsers.length - 1];
      const nextWorkspaceState = {
        ...persistAccountSnapshot(
          workspaceState,
          nextUser.account,
          normalizeStoredSnapshot(createDefaultUserSnapshot(nextUser), {
            profile: {
              role: buildProfileRole(createDefaultSnapshot(), payload),
            },
          }),
          nextUser,
        ),
      };

      await saveSessions({
        ...sessions,
        [nextSessionId]: nextSession,
      });
      await saveUsers(nextUsers);
      await saveWorkspaceState(nextWorkspaceState);
      response.setHeader('Set-Cookie', buildSessionCookie(nextSessionId));
      jsonResponse(response, 200, nextSession);
      return;
    }

    if (request.method === 'POST' && pathname === '/auth/logout') {
      const { sessionId, sessions } = await getRequestSessionContext(request);
      if (sessionId && sessions[sessionId]) {
        delete sessions[sessionId];
        await saveSessions(sessions);
      }
      response.setHeader('Set-Cookie', buildClearedSessionCookie());
      emptyResponse(response);
      return;
    }

    if (request.method === 'POST' && pathname === '/auth/professor-applications') {
      const payload = await readRequestBody(request);
      if (!payload?.name || !payload?.email || !payload?.focus) {
        sendError(response, 400, 'Missing professor application fields.');
        return;
      }

      const receipt = {
        submittedAt: new Date().toISOString(),
        status: 'submitted',
      };

      await appendProfessorApplication({
        ...payload,
        ...receipt,
      });
      jsonResponse(response, 200, receipt);
      return;
    }

    if (request.method === 'GET' && pathname === '/profile') {
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = buildResponseSnapshot(workspaceState, account, user, session);
      jsonResponse(response, 200, snapshot.profile);
      return;
    }

    if (request.method === 'PUT' && pathname === '/profile') {
      const payload = await readRequestBody(request);
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      if (!requireAuthenticatedSession(response, session)) {
        return;
      }
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const currentSnapshot = getSnapshotForAccount(workspaceState, account, user);
      const nextSnapshot = {
        ...currentSnapshot,
        profile: payload,
      };
      const nextUsers =
        account
          ? users.map((user) =>
              user.account === account
                ? {
                    ...user,
                    displayName: typeof payload?.name === 'string' ? payload.name : user.displayName,
                  }
                : user,
            )
          : users;
      const nextWorkspaceState = persistAccountSnapshot(workspaceState, account, nextSnapshot, user);

      await saveUsers(nextUsers);
      await saveWorkspaceState(nextWorkspaceState);
      jsonResponse(response, 200, nextSnapshot.profile);
      return;
    }

    if (request.method === 'GET' && pathname === '/learning/course-runtime') {
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = buildResponseSnapshot(workspaceState, account, user, session);
      jsonResponse(response, 200, snapshot.courseRuntime);
      return;
    }

    if (request.method === 'PUT' && pathname.startsWith('/learning/course-runtime/')) {
      const payload = await readRequestBody(request);
      const courseId = pathname.split('/').at(-1);
      if (!courseId || !payload?.runtime) {
        sendError(response, 400, 'Missing course runtime payload.');
        return;
      }

      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      if (!requireAuthenticatedSession(response, session)) {
        return;
      }
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = getSnapshotForAccount(workspaceState, account, user);
      const nextSnapshot = {
        ...snapshot,
        courseRuntime: {
          ...snapshot.courseRuntime,
          [courseId]: payload.runtime,
        },
      };

      await saveWorkspaceState(persistAccountSnapshot(workspaceState, account, nextSnapshot, user));
      jsonResponse(response, 200, nextSnapshot.courseRuntime);
      return;
    }

    if (request.method === 'GET' && pathname === '/library/runtime') {
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = buildResponseSnapshot(workspaceState, account, user, session);
      jsonResponse(response, 200, snapshot.libraryRuntime);
      return;
    }

    if (request.method === 'PUT' && pathname.startsWith('/library/runtime/')) {
      const payload = await readRequestBody(request);
      const resourceId = pathname.split('/').at(-1);
      if (!resourceId || !payload?.runtime) {
        sendError(response, 400, 'Missing library runtime payload.');
        return;
      }

      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      if (!requireAuthenticatedSession(response, session)) {
        return;
      }
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = getSnapshotForAccount(workspaceState, account, user);
      const nextSnapshot = {
        ...snapshot,
        libraryRuntime: {
          ...snapshot.libraryRuntime,
          [resourceId]: payload.runtime,
        },
      };

      await saveWorkspaceState(persistAccountSnapshot(workspaceState, account, nextSnapshot, user));
      jsonResponse(response, 200, nextSnapshot.libraryRuntime);
      return;
    }

    if (request.method === 'GET' && pathname === '/sync/snapshot') {
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      const users = await readUsers();
      const account = session?.account ?? null;
      const user = account ? findUser(users, account) : null;
      const snapshot = buildResponseSnapshot(workspaceState, account, user, session);
      jsonResponse(response, 200, snapshot);
      return;
    }

    if (request.method === 'PUT' && pathname === '/sync/snapshot') {
      const payload = await readRequestBody(request);
      const workspaceState = await readWorkspaceState();
      const sessionContext = await getRequestSessionContext(request);
      applyClearedSessionCookieIfNeeded(response, sessionContext);
      const { session } = sessionContext;
      if (!requireAuthenticatedSession(response, session)) {
        return;
      }
      const users = await readUsers();
      const currentAccount = session?.account ?? null;
      const targetAccount =
        typeof payload?.authSession?.account === 'string'
          ? payload.authSession.account.trim()
          : currentAccount;
      const user = targetAccount ? findUser(users, targetAccount) : null;
      const nextWorkspaceState = {
        ...persistAccountSnapshot(workspaceState, targetAccount, normalizeStoredSnapshot(payload), user),
      };
      const nextUsers =
        targetAccount
          ? users.map((currentUser) =>
              currentUser.account === targetAccount
                ? {
                    ...currentUser,
                    displayName:
                      typeof payload?.profile?.name === 'string' ? payload.profile.name : currentUser.displayName,
                    degree:
                      typeof payload?.authSession?.degree === 'string' ? payload.authSession.degree : currentUser.degree,
                  }
                : currentUser,
            )
          : users;

      await saveUsers(nextUsers);
      await saveWorkspaceState(nextWorkspaceState);
      jsonResponse(
        response,
        200,
        buildResponseSnapshot(
          nextWorkspaceState,
          targetAccount,
          user,
          session && targetAccount === session.account ? session : payload?.authSession ?? null,
        ),
      );
      return;
    }

    sendError(response, 404, `Route not found: ${request.method} ${pathname}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    sendError(response, 500, message);
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`AMAS API listening on http://127.0.0.1:${port}`);
});
