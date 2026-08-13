'use client';

import Link from 'next/link';

import { useSite } from './SiteProvider';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox='0 0 64 64'
      role='img'
      aria-label='月轨播放标志'
      className={className}
      fill='none'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path
        d='M46.5 13.5A24 24 0 1 0 53 43'
        stroke='currentColor'
        strokeWidth='6'
        strokeLinecap='round'
      />
      <path d='M28 21.5 44 32 28 42.5v-21Z' fill='currentColor' />
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
      <BrandMark className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      {!compact && (
        <span className='font-bold tracking-tight text-[length:inherit]'>
          {siteName}
        </span>
      )}
    </Link>
  );
}
