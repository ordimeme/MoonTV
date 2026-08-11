'use client';

import Link from 'next/link';

import { useSite } from './SiteProvider';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function PandaMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 64 64'
      role='img'
      aria-label='极简熊猫播放标志'
      className={className}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <circle cx='18' cy='15' r='8' fill='currentColor' />
      <circle cx='46' cy='15' r='8' fill='currentColor' />
      <path
        d='M14 34c0-14 7-23 18-23s18 9 18 23c0 12-7 20-18 20s-18-8-18-20Z'
        stroke='currentColor'
        strokeWidth='3.5'
        strokeLinejoin='round'
      />
      <path
        d='m22 29 7-5-2 9-5-4Zm20 0-7-5 2 9 5-4Z'
        fill='currentColor'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinejoin='round'
      />
      <path d='m29 36 8 5-8 5V36Z' fill='currentColor' />
      <path
        d='M24 49c2.5 2 5.2 3 8 3s5.5-1 8-3'
        stroke='currentColor'
        strokeWidth='2.5'
        strokeLinecap='round'
      />
    </svg>
  );
}

export default function BrandLogo({
  compact = false,
  className = '',
}: BrandLogoProps) {
  const { siteName } = useSite();
  return (
    <Link
      href='/'
      prefetch={false}
      aria-label={`${siteName} 首页`}
      className={`inline-flex items-center justify-center gap-2 text-green-600 hover:text-green-500 transition-colors ${className}`}
    >
      <PandaMark className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      {!compact && (
        <span className='font-bold tracking-tight text-[length:inherit]'>
          {siteName}
        </span>
      )}
    </Link>
  );
}
