// Reenvía el payload del hook de Claude Code a Colmena. Nunca escribe en stdout/stderr y siempre sale con 0.
const http = require('node:http');

const done = () => process.exit(0);
setTimeout(done, 2000).unref();

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (body += d));
process.stdin.on('error', done);
process.stdin.on('end', () => {
  try {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: process.env.COLMENA_PORT,
        path: '/hook',
        method: 'POST',
        timeout: 2000,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'x-colmena-token': process.env.COLMENA_TOKEN || '',
          'x-colmena-session': process.env.COLMENA_SESSION || '',
        },
      },
      (res) => {
        res.resume();
        res.on('end', done);
      },
    );
    req.on('error', done);
    req.on('timeout', done);
    req.end(body);
  } catch {
    done();
  }
});
