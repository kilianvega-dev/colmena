# Colmena: diseño v1

Fecha: 2026-11-23. Autor de las decisiones: Kilian. Redacción: Claude.

## Intención

Colmena es un panel local para trabajar con varias sesiones de Claude Code a la vez. Cada sesión vive en su propio panel, con su carpeta, y Colmena muestra en todo momento cuál está **trabajando**, cuál **te está esperando** y cuál **terminó**. Si una sesión se detiene a preguntar algo, avisa.

Está inspirada en deska.dev, pero no la clona: toma solo el núcleo (varios agentes visibles a la vez y saber cuál te necesita) y lo construye para el uso diario de Kilian en Windows.

**Por qué ahora:** Kilian quiere un proyecto propio, real y en desarrollo activo para postular en 3 o 4 semanas a un programa en el que se desarrolla con un asistente de IA. El repo tiene que mostrar historia real desde el primer commit.

## Metas

- Abrir varias sesiones de Claude Code en paneles dentro de una sola página del navegador.
- Ver el estado de cada sesión sin tener que leer su terminal.
- Recibir un aviso cuando una sesión espera a Kilian.
- Abrir también terminales normales (PowerShell, sin Claude) al lado, por ejemplo para `npm run dev`.
- No perder las sesiones al reiniciar: Colmena las recuerda y ofrece reanudarlas.

## Fuera de la v1 (no metas)

Orquestador tipo Dex, varias cuentas del mismo agente, nube, equipos, marketplace, artefactos con versiones, lienzo infinito, acceso desde el celular, Mac y Linux, y agentes que no sean Claude Code. Pueden llegar en versiones siguientes.

## Qué sería fracasar (anti-metas)

- Kilian no la usa a diario en sus propios proyectos dentro de 2 semanas, aunque técnicamente funcione.
- Colmena modifica la configuración global de Claude (`~/.claude/settings.json`) o afecta las sesiones de Claude que Kilian abre fuera de ella.
- Las terminales quedan expuestas a la red.

## Restricciones

- Windows 11 y Node 24. Claude Code 2.1.323 instalado en `C:\Users\User\.local\bin\claude.exe`.
- El servidor escucha **solo en `127.0.0.1`**. No hay autenticación en la v1, y por eso no se abre a la red.
- No se toca la configuración global de Claude Code.
- Proyecto en `C:\Users\User\Documents\colmena` (fuera de OneDrive) y repo público en GitHub (`kilianvega-dev/colmena`) desde el primer commit.

## Enfoques considerados

1. **App web local (elegido):** servidor Node + TypeScript en el PC de Kilian y la interfaz en el navegador en `localhost`. Ya maneja TypeScript, se depura con las herramientas del navegador, abrirla desde el celular es una extensión natural, y se puede envolver en Electron más adelante sin rehacerla.
2. **App de escritorio desde el día uno (Electron o Tauri):** se siente más como Deska, pero agrega empaquetado, actualizaciones y depuración más pesada antes de tener nada útil.
3. **Extensión de un editor (VS Code):** reutiliza las terminales del editor, pero ata el proyecto a VS Code y se aleja de la idea de un espacio propio.

Para saber el estado de cada sesión:

- **Hooks de Claude Code (elegido):** eventos oficiales que Claude dispara en momentos concretos. Es un contrato estable.
- **Leer el texto de la terminal:** se rompe cada vez que Claude cambia su interfaz. Descartado.

## Lo que Kilian decidió

### Arquitectura

- **Servidor:** Node + TypeScript, sin framework web. Usa `ws` para WebSocket y `node-pty` para las terminales reales (ConPTY en Windows).
- **Interfaz:** React + Vite + Tailwind, para poder usar después componentes de shadcn y de las librerías favoritas de Kilian.
- **Terminal en el navegador:** `xterm.js`.

### Sesiones de Claude

- Cada panel de Claude se lanza como:
  `claude --session-id <uuid> --settings <archivo-de-hooks-de-colmena>`
  El uuid lo genera Colmena. El archivo de hooks solo existe para las sesiones que abre Colmena, así que las sesiones normales de Claude no se enteran.
- Al reanudar se lanza `claude --resume <uuid> --settings <archivo-de-hooks-de-colmena>` en la misma carpeta.
- Los hooks llaman a un script pequeño de Colmena. Ese script lee el JSON que Claude manda por stdin (incluye `session_id` y el nombre del evento) y lo envía por HTTP a `127.0.0.1:<puerto>`. El puerto llega por una variable de entorno que Colmena pone al lanzar la terminal.

### Estados de una sesión de Claude

| Estado | Cuándo entra |
|---|---|
| `iniciando` | Colmena lanzó el proceso y todavía no llega ningún evento |
| `trabajando` | `UserPromptSubmit` (Kilian envió un mensaje) o `PreToolUse` |
| `esperando` | `Notification` (Claude pide permiso o lleva rato esperando respuesta) |
| `terminado` | `Stop` (Claude terminó de responder) |
| `cerrado` | `SessionEnd` o el proceso de la terminal salió |

Solo `esperando` dispara el aviso. `terminado` se marca en el panel, pero no suena.

**Verificado el 2026-11-23** con Claude Code 2.1.323: lanzando `claude --session-id <uuid> --settings hooks.json`, se dispararon `SessionStart`, `UserPromptSubmit`, `Stop` y `SessionEnd`. El `session_id` del JSON es el uuid que se pasó, y la variable de entorno del puerto llega al script del hook. Con `--resume <uuid> --settings hooks.json` llegaron los mismos eventos con el mismo id. La ayuda de Claude describe `--settings` como "additional settings", es decir, se suma a la configuración global sin reemplazarla. `Notification` no se probó en modo `-p` porque no hay permisos que pedir. Se prueba en el primer paso del plan con una sesión interactiva.

**Decisión de Claude:** el estado sale solo de los hooks, sin deducirlo por inactividad. Si `Notification` resulta poco fiable en la prueba interactiva, se vuelve a hablar antes de agregar otra señal.

### Interfaz

- Una cuadrícula de paneles que se acomoda sola según cuántos haya (1, 2, 4 o más), con divisiones que se pueden arrastrar.
- Cada panel muestra en la cabecera: el nombre de la carpeta, el tipo (Claude o terminal), el estado con un color y un botón para cerrar.
- El botón **Nueva sesión** pide la carpeta (lista de carpetas recientes más un campo para pegar una ruta) y el tipo (Claude o terminal).
- Avisos cuando una sesión pasa a `esperando`: notificación del navegador, un sonido corto, el panel resaltado y el título de la pestaña con la cuenta, por ejemplo `(2) Colmena`. El título funciona aunque Kilian niegue las notificaciones.

### Persistencia

- Un archivo JSON local guarda las sesiones (id, tipo, carpeta, último estado), el orden de los paneles y las carpetas recientes.
- Al abrir Colmena, las sesiones de Claude guardadas aparecen como paneles con la opción **Reanudar**. Las terminales normales no se reanudan: aparecen cerradas y se pueden volver a abrir en la misma carpeta.

### Ciclo de vida (decisiones de Claude, a revisar)

- **Las terminales viven en el servidor, no en la pestaña.** Cerrar o recargar el navegador no mata ninguna sesión. El servidor guarda las últimas líneas de salida de cada terminal (un búfer acotado) y, al reconectar, las reenvía para que el panel se vea igual.
- **Al apagar el servidor** (Ctrl+C), se cierran todos los procesos hijos. Al arrancar, toda sesión guardada se marca `cerrado`. Las de Claude ofrecen **Reanudar**. No se intenta reconectar con procesos de una ejecución anterior.
- **Un solo comando para el uso diario:** `npm start` compila la interfaz y el servidor la sirve en el mismo puerto que el WebSocket. En desarrollo, Vite corre aparte con un proxy hacia el servidor.

### Seguridad (decisiones de Claude)

- El servidor escucha solo en `127.0.0.1`.
- Rechaza cualquier conexión WebSocket o HTTP cuyo `Host` no sea `127.0.0.1:<puerto>` o `localhost:<puerto>`, y cualquier WebSocket cuyo `Origin` no sea la propia interfaz de Colmena. Así ninguna página web abierta en el navegador puede conectarse a las terminales, y se bloquea el ataque de DNS rebinding.
- La ruta que recibe los eventos de los hooks exige un token aleatorio que Colmena genera al arrancar y pasa por variable de entorno a cada terminal.

### Pruebas

- Vitest para la lógica del servidor: los cambios de estado por cada evento, la lectura del JSON de los hooks y el guardado y carga del archivo de persistencia.
- La interfaz se prueba a mano en la v1. Playwright puede entrar cuando la interfaz se estabilice.

## Lo que queda a criterio del constructor

- La estructura de carpetas del repo y si usar un solo `package.json` o dos.
- El puerto por defecto y cómo cambiarlo.
- Dónde vive el archivo de persistencia (dentro del repo ignorado por git, o en `%APPDATA%\colmena`).
- La librería para las divisiones arrastrables de la cuadrícula.
- El sonido del aviso y el estilo visual, siempre que los estados se distingan por algo más que el color (accesibilidad).
- El formato exacto de los mensajes WebSocket entre servidor e interfaz.
