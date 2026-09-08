import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@adpub/auth';
import { webEnv } from '@/lib/env';

export async function POST(): Promise<NextResponse> {
  const env = webEnv();
  const response = NextResponse.redirect(`${env.webUrl}/login`);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
