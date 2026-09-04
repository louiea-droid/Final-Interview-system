import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';

import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  createSessionToken,
} from '../../../../lib/adminSession';

function safeCompare(a, b) {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);

  if (aBytes.length !== bBytes.length) return false;

  return timingSafeEqual(aBytes, bBytes);
}

export async function POST(request) {
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!adminUsername || !adminPassword || !sessionSecret) {
    return NextResponse.json(
      {
        error:
          'Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_SESSION_SECRET.',
      },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === 'string' ? body.username : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  // Compare both before deciding so a wrong username and a wrong password
  // cost the same, and report them together so neither can be probed alone.
  const usernameMatches = safeCompare(username, adminUsername);
  const passwordMatches = safeCompare(password, adminPassword);

  if (!usernameMatches || !passwordMatches) {
    return NextResponse.json(
      { error: 'Incorrect username or password.' },
      { status: 401 }
    );
  }

  const token = await createSessionToken(sessionSecret, ADMIN_SESSION_TTL_MS);
  const response = NextResponse.json({ success: true });

  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });

  return response;
}
