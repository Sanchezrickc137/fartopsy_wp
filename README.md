# Fartopsy — Welcome + intro

Copia independiente de la intro y Welcome. No incluye About Me, Socials, galería, arcade, perfil ni la página de ajustes del proyecto completo.

Incluye la intro cinematográfica, puzzle de cinco tarjetas, personaje colgante, fondo de estrellas, marca de partículas, tarjetas y carpetas animadas, aplausos personalizables, música y efectos, texto curvo del footer y botón para volver arriba. Las preferencias de movimiento/sonido y el botón **Replay intro** están en la cabecera.

## Abrir localmente

Necesitas Node.js 22 o posterior. No hay dependencias que instalar.

```sh
npm start
```

Abre **http://127.0.0.1:4181**. Para comprobar los archivos: `npm test`.

La web ya está lista en `index.html`; no necesita compilación. Sírvela por HTTP, porque abrir el HTML directamente con `file://` puede bloquear los módulos y el audio.

## Subir a GitHub

1. Crea un repositorio vacío y sube **el contenido de esta carpeta**, manteniendo su estructura. `index.html` debe quedar en la raíz del repositorio.
2. Para verla online, abre **Settings → Pages**, elige **Deploy from a branch**, la rama **main** y la carpeta **/(root)**.
3. Guarda. Las rutas relativas funcionan también en `https://USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/`.

También puedes usar Git desde la carpeta entregada: el repositorio local ya está inicializado. Si extraes el ZIP, ejecuta primero `git init -b main`, porque el ZIP no incluye el historial `.git`. Añade tu remoto, crea tu primer commit y haz push cuando quieras. No se ha creado ni publicado ningún repositorio remoto.

## Qué cambia solo en esta copia

- Las visitas y aplausos se guardan **solo en este navegador**; no conectan con los contadores del sitio original. “This browser” indica la sesión local, y 24 cartas sigue siendo un ejemplo.
- Las carpetas About Me/Socials mantienen su aspecto e interacción visual. Al pulsarlas explican que esas secciones no están incluidas. Guestbook y Twitch conservan sus enlaces externos.
- Credits abre una ficha breve de atribución. No se incluye la experiencia completa de Credits.
- Ajustes de esta copia usan claves independientes, con prefijo `fartopsy-welcome-demo-`.
- En modo de movimiento reducido se respetan las preferencias del sistema. El navegador puede requerir una interacción para reproducir música.

El proyecto original no se ha modificado. Esta carpeta es una extracción, no una rama de desarrollo de la web completa.

## Archivos

- `index.html`: página y script de intro integrado, para que la entrada funcione antes del resto de módulos.
- `app.js`: integración exclusiva de Welcome y contadores locales.
- Módulos `.js` y hojas `.css`: interacciones y estilos de Welcome.
- `assets/`, `still/`, `funyamora/`, `icons/`, `font/`, `audio/`: únicamente los recursos utilizados.
- `tools/`: servidor local y validación de rutas.

Las imágenes, fuentes y sonidos conservan sus atribuciones y licencias; no se les concede una nueva licencia de reutilización. Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
