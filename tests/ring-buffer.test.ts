import { RingBuffer } from '../server/ring-buffer.ts';

test('descarta lo más antiguo al pasarse del límite', () => {
  const b = new RingBuffer(10);
  b.push('12345678');
  b.push('abcdef');
  expect(b.toString()).toBe('5678abcdef');
});
