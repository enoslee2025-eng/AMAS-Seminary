import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const serverEntry = path.join(workspaceRoot, 'server', 'amas-api.mjs');
const port = Number(process.env.AMAS_API_PORT ?? '8790');
const sessionTtlMs = Number(process.env.AMAS_API_SESSION_TTL_MS ?? '180');
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
      // Ignore boot-time connection errors and retry.
    }

    await sleep(200);
  }

  throw new Error('AMAS local API did not become healthy in time.');
}

async function readJsonResponse(response) {
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function request(baseUrl, pathname, init = {}) {
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
    const nextCookie = setCookie.split(';', 1)[0];
    cookieJar = nextCookie === 'amas_session_id=' ? '' : nextCookie;
  }

  return response;
}

async function requestJson(baseUrl, pathname, init = {}) {
  const response = await request(baseUrl, pathname, init);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${pathname} failed: ${response.status} ${body}`);
  }

  return readJsonResponse(response);
}

async function expectFailure(baseUrl, pathname, expectedStatus, init = {}) {
  const response = await request(baseUrl, pathname, init);
  if (response.status !== expectedStatus) {
    const body = await response.text();
    throw new Error(`${init.method ?? 'GET'} ${pathname} should fail with ${expectedStatus}, got ${response.status}: ${body}`);
  }

  return response;
}

async function main() {
  const tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'amas-api-expiry-'));
  const baseUrl = `http://127.0.0.1:${port}`;
  const apiProcess = spawn(process.execPath, [serverEntry], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      AMAS_API_PORT: String(port),
      AMAS_API_DATA_DIR: tempDataDir,
      AMAS_API_SESSION_TTL_MS: String(sessionTtlMs),
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
    await waitForHealth(baseUrl);

    const registerPayload = {
      account: 'expiry@amas.local',
      password: '123456',
      degree: 'M.A.',
      displayName: 'Expiry User',
      mode: 'register',
    };

    const session = await requestJson(baseUrl, '/auth/register', {
      method: 'POST',
      body: JSON.stringify(registerPayload),
    });
    assert(session.account === registerPayload.account, 'Register should create the expiring session.');
    assert(typeof session.expiresAt === 'string', 'Register should expose the expiring session timestamp.');

    const activeSession = await requestJson(baseUrl, '/auth/session');
    assert(activeSession?.account === registerPayload.account, 'Session probe should succeed before expiry.');
    assert(typeof activeSession?.expiresAt === 'string', 'Session probe should expose the same expiry timestamp.');
    const refreshLeadInMs = Math.max(Math.floor(sessionTtlMs * 0.6), 20);
    await sleep(refreshLeadInMs);
    const refreshedSession = await requestJson(baseUrl, '/auth/refresh', {
      method: 'POST',
    });
    assert(refreshedSession.account === registerPayload.account, 'Session refresh should succeed before expiry.');
    assert(
      Date.parse(refreshedSession.expiresAt) > Date.parse(activeSession.expiresAt),
      'Session refresh should extend the short-lived expiry timestamp.',
    );

    const originalExpiryDelay = Math.max(Date.parse(activeSession.expiresAt) - Date.now() + 30, 30);
    await sleep(originalExpiryDelay);

    const stillActiveSession = await requestJson(baseUrl, '/auth/session');
    assert(stillActiveSession?.account === registerPayload.account, 'Refreshed session should survive past the original expiry.');

    const refreshedExpiryDelay = Math.max(Date.parse(refreshedSession.expiresAt) - Date.now() + 40, 40);
    await sleep(refreshedExpiryDelay);

    const expiredSessionResponse = await request(baseUrl, '/auth/session');
    assert(expiredSessionResponse.ok, 'Expired session probe should still resolve successfully.');
    assert(
      expiredSessionResponse.headers.get('set-cookie')?.includes('Max-Age=0'),
      'Expired session probe should clear the stale cookie.',
    );
    const expiredSession = await readJsonResponse(expiredSessionResponse);
    assert(expiredSession === null, 'Expired session probe should return null.');
    assert(cookieJar === '', 'Expired session probe should clear the local cookie jar.');

    const expiredSnapshot = await requestJson(baseUrl, '/sync/snapshot');
    assert(expiredSnapshot.authSession === null, 'Expired session should not survive in sync snapshot reads.');

    await expectFailure(baseUrl, '/profile', 401, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Expired User',
        role: 'M.A. 学员',
        bio: 'Should not persist while expired.',
        email: registerPayload.account,
        location: 'Bangkok',
      }),
    });

    const reloginSession = await requestJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        ...registerPayload,
        mode: 'login',
      }),
    });
    assert(reloginSession.account === registerPayload.account, 'Re-login should recover after session expiry.');
    const recoveredSession = await requestJson(baseUrl, '/auth/session');
    assert(recoveredSession?.account === registerPayload.account, 'Session probe should recover after re-login.');

    console.log('Remote expiry smoke checks passed: refresh extension, TTL expiry, cookie clearing, protected writes, re-login recovery.');
  } catch (error) {
    console.error('Remote expiry smoke checks failed.');
    console.error(error instanceof Error ? error.message : error);
    console.error('\nAPI log:\n');
    console.error(combinedLog.trim());
    throw error;
  } finally {
    apiProcess.kill('SIGTERM');
    await sleep(150);
    if (apiProcess.exitCode === null) {
      apiProcess.kill('SIGKILL');
    }
    await rm(tempDataDir, { recursive: true, force: true });
  }
}

main().catch(() => {
  process.exitCode = 1;
});
