'use client';

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang='zh-CN'>
      <body className='flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100'>
        <main className='w-full max-w-md rounded-3xl bg-slate-900 p-8 text-center shadow-xl'>
          <h1 className='text-2xl font-bold'>页面暂时无法加载</h1>
          <p className='mt-3 text-sm text-slate-400'>请稍后重试。</p>
          <button
            className='mt-6 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-slate-900'
            onClick={reset}
            type='button'
          >
            重新加载
          </button>
        </main>
      </body>
    </html>
  );
}
