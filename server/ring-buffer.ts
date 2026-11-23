export class RingBuffer {
  private data = '';
  private maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  // shortcut: cuenta caracteres, no bytes; basta para un replay de terminal
  push(s: string): void {
    this.data += s;
    if (this.data.length > this.maxBytes) this.data = this.data.slice(-this.maxBytes);
  }

  toString(): string {
    return this.data;
  }
}
