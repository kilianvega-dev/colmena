import { isAllowedHost, isAllowedOrigin, sameToken } from '../server/security.ts';

describe('isAllowedHost', () => {
  it('acepta loopback con el puerto', () => {
    expect(isAllowedHost('127.0.0.1:4777', 4777)).toBe(true);
    expect(isAllowedHost('localhost:4777', 4777)).toBe(true);
    expect(isAllowedHost('LOCALHOST:4777', 4777)).toBe(true);
  });
  it('rechaza el resto', () => {
    for (const h of ['evil.com', '127.0.0.1:80', undefined, 'localhost.evil.com:4777'])
      expect(isAllowedHost(h, 4777)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('acepta loopback', () => {
    expect(isAllowedOrigin('http://127.0.0.1:4777', 4777)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4777', 4777)).toBe(true);
  });
  it('devPort solo si se da', () => {
    expect(isAllowedOrigin('http://localhost:5173', 4777)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5173', 4777, 5173)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', 4777, 5173)).toBe(true);
  });
  it('rechaza el resto', () => {
    for (const o of ['https://evil.com', undefined, 'null'])
      expect(isAllowedOrigin(o, 4777, 5173)).toBe(false);
  });
});

test('sameToken: igual pasa; distinto, otro largo o no-texto falla', () => {
  expect(sameToken('abc123', 'abc123')).toBe(true);
  expect(sameToken('abc124', 'abc123')).toBe(false);
  expect(sameToken('abc', 'abc123')).toBe(false);
  expect(sameToken(undefined, 'abc123')).toBe(false);
  expect(sameToken(['abc123'], 'abc123')).toBe(false);
});
