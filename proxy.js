import { NextRequest, NextResponse } from 'next/server';

import { ADMIN_SESSION_COOKIE, verifySessionToken } from './lib/adminSession';

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  const isAuthenticated = Boolean(
    token && sessionSecret && (await verifySessionToken(token, sessionSecret))
  );

  if (pathname.startsWith('/admin/login')) {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('from', pathname);

    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*'],
};
