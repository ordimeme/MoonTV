/* eslint-disable */

addEventListener('fetch', (event) => {
  event.respondWith(
    new Response('This legacy proxy has been permanently disabled.', {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  );
});
