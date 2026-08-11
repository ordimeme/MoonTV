'use client';

import { BackButton } from './BackButton';
import BrandLogo from './BrandLogo';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

interface MobileHeaderProps {
  showBackButton?: boolean;
}

const MobileHeader = ({ showBackButton = false }: MobileHeaderProps) => {
  return (
    <header className='app-mobile-header md:hidden relative w-full bg-white/70 backdrop-blur-xl border-b border-gray-200/50 shadow-sm dark:bg-gray-900/70 dark:border-gray-700/50'>
      <div className='app-mobile-header-row flex items-center justify-between'>
        {/* 左侧：返回按钮和设置按钮 */}
        <div className='app-mobile-header-actions flex items-center'>
          {showBackButton && <BackButton />}
        </div>

        {/* 右侧按钮 */}
        <div className='app-mobile-header-actions flex items-center'>
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>

      {/* 中间：Logo（绝对居中） */}
      <div className='app-mobile-title-container absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'>
        <BrandLogo className='app-mobile-title text-lg' />
      </div>
    </header>
  );
};

export default MobileHeader;
