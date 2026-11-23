export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return h === `127.0.0.1:${port}` || h === `localhost:${port}`;
}

export function isAllowedOrigin(origin: string | undefined, port: number, devPort?: number): boolean {
  if (!origin) return false;
  const ports = devPort === undefined ? [port] : [port, devPort];
  return ports.some((p) => origin === `http://127.0.0.1:${p}` || origin === `http://localhost:${p}`);
}
