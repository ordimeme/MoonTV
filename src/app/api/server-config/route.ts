/* eslint-disable no-console */

import { NextResponse } from 'next/server';

export async function GET() {
  const result = {
    SiteName: process.env.SITE_NAME || 'MoonTV',
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
  };
  return NextResponse.json(result);
}
