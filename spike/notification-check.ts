import { spawn } from 'node-pty'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const fwd = (p: string) => p.split('\\').join('/')
const dir = mkdtempSync(join(tmpdir(), 'colmena-spike-'))
const log = fwd(join(dir, 'events.log'))
const hook = fwd(join(dir, 'log-hook.cjs'))
const hookSource = [
  'const e = process.argv[2]; let s = ""',
  'process.stdin.on("data", (d) => (s += d)).on("end", () =>',
  `  require("fs").appendFileSync(${JSON.stringify(log)}, Date.now() + " " + e + " " + s.replace(/\\s+/g, " ") + "\\n"))`,
].join('\n')
writeFileSync(hook, hookSource)
const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Notification', 'Stop', 'SessionEnd']
const hooks = Object.fromEntries(events.map((e) => [e, [{ hooks: [{ type: 'command', command: `node "${hook}" ${e}` }] }]]))
const settings = join(dir, 'hooks.json')
writeFileSync(settings, JSON.stringify({ hooks }, null, 2))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const read = () => (existsSync(log) ? readFileSync(log, 'utf8') : '')

let out = ''
const pty = spawn('claude.exe', ['--session-id', randomUUID(), '--settings', settings, '--model', 'haiku', '--permission-mode', 'default'], {
  cwd: dir, cols: 120, rows: 30, name: 'xterm-256color',
})
let trusted = false
pty.onData((d) => {
  out += d
  // "trust this folder?" prompt: default is "No, exit": Down then Enter, once
  if (!trusted && out.includes('trust?')) {
    trusted = true
    setTimeout(() => pty.write('\x1b[B'), 2000)
    setTimeout(() => pty.write('\r'), 2500)
  }
})

await sleep(8000)
pty.write('crea el archivo prueba.txt con el texto hola\r')
const start = Date.now()
let found = false
while (Date.now() - start < 90_000 && !(found = read().includes(' Notification '))) await sleep(500)

console.log(`Notification: ${found ? 'SI' : 'NO'}; prueba.txt existe: ${existsSync(join(dir, 'prueba.txt'))}`)
console.log('--- log ---\n' + read())
if (!found) console.log('--- cola del pty ---\n' + out.slice(-2000))
pty.kill()
process.exit(found ? 0 : 1)
