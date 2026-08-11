/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps */

'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  const setThemeColor = (theme?: string) => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = theme === 'dark' ? '#0c111c' : '#f9fbfe';
      document.head.appendChild(meta);
    } else {
      meta.setAttribute('content', theme === 'dark' ? '#0c111c' : '#f9fbfe');
    }
  };

  useEffect(() => {
    const currentTheme = document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
    setResolvedTheme(currentTheme);
    setMounted(true);
    setThemeColor(currentTheme);
  }, []);

  if (!mounted) {
    // 渲染一个占位符以避免布局偏移
    return <div className='w-11 h-11' />;
  }

  const toggleTheme = () => {
    // 检查浏览器是否支持 View Transitions API
    const targetTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    const applyTheme = () => {
      localStorage.setItem('theme', targetTheme);
      document.documentElement.classList.toggle('dark', targetTheme === 'dark');
      setResolvedTheme(targetTheme);
    };
    setThemeColor(targetTheme);
    if (!(document as any).startViewTransition) {
      applyTheme();
      return;
    }

    (document as any).startViewTransition(() => {
      applyTheme();
    });
  };

  return (
    <button
      onClick={toggleTheme}
      className='w-11 h-11 p-2.5 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
      aria-label={
        resolvedTheme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
      }
    >
      {resolvedTheme === 'dark' ? (
        <Sun className='w-full h-full' />
      ) : (
        <Moon className='w-full h-full' />
      )}
    </button>
  );
}
