# Colmena

Panel web local para correr varias sesiones de Claude Code (y terminales) a la vez, con el estado de cada una en vivo.

## Uso

```
npm install
npm start
```

Abre http://127.0.0.1:4777 (puerto cambiable con `COLMENA_PORT`). Con "Nueva sesión" eliges Claude o Terminal y una carpeta (recientes o ruta pegada). Cuando una sesión pasa a `esperando` suena un bip, el panel se resalta y el título de la pestaña muestra `(n) Colmena`.

Para desarrollo: `npm run dev` (servidor + Vite en http://localhost:5173).

## Cómo funcionan los hooks

Colmena lanza cada Claude con `--settings <archivo>`, un archivo de hooks propio guardado en su carpeta de datos. Los hooks avisan por HTTP al servidor local (`/hook`) cuando Claude trabaja, espera o termina, y así se calcula el estado del panel.

No se toca `~/.claude/settings.json` ni ninguna configuración global: los hooks solo existen en las sesiones que lanza Colmena, así que tus otras sesiones de Claude Code no se ven afectadas.
