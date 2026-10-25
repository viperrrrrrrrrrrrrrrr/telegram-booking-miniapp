// Local stand-in for https://api.telegram.org: records every Bot API call. No real token or network.
import http from 'node:http';
export function startBotStub(port = 8789) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/__calls') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(calls)); }
      const m = req.url.match(/^\/bot([^/]+)\/(\w+)$/);
      if (!m) { res.statusCode = 404; return res.end('{}'); }
      let payload = {}; try { payload = JSON.parse(body || '{}'); } catch {}
      calls.push({ token: m[1], method: m[2], payload, at: Date.now() });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: { message_id: calls.length } }));
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ calls, close: () => server.close(), reset: () => (calls.length = 0) })));
}
if (import.meta.url === `file://${process.argv[1]}`) { await startBotStub(); console.log('bot stub on :8789'); }
