import Link from 'next/link';

export default function NotFound() {
  return (
    <main className='flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100'>
      <section className='w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl dark:bg-slate-900'>
        <p className='text-sm font-semibold text-green-600'>404</p>
        <h1 className='mt-3 text-2xl font-bold'>页面不存在</h1>
        <p className='mt-3 text-sm text-slate-500 dark:text-slate-400'>
          这个地址可能已失效，或内容已经移动。
        </p>
        <Link
          className='mt-6 inline-flex rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'
          href='/'
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
