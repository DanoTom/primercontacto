# CÓMO ACTUALIZAR RÍO MANSO

Guía en lenguaje simple para hacer cambios al juego, probarlos y
publicarlos. Sin jerga: cada término técnico se explica la primera vez.

**El juego vive acá:** https://primer-contacto.danotommasi.workers.dev
(la dirección conserva el nombre técnico anterior; el juego es Río Manso.)

**Para agregar o cambiar desafíos:** se editan en `src/desafios.js`
(cada desafío es un bloque con su `generar()`) y su dibujo en
`public/app.js` (función `dibujarDesafio`).

---

## La idea general (cómo funciona la maquinaria)

1. El código del juego vive en **GitHub** (este repositorio, que es como
   una carpeta en la nube con historial de todos los cambios).
2. Cada vez que se guarda un cambio en la rama `main` (la versión
   "oficial" del código), un **robot de GitHub** (pestaña *Actions*)
   publica automáticamente la nueva versión en **Cloudflare** (los
   servidores donde corre el juego). Tarda alrededor de un minuto.
3. No hay nada más que mantener: ni servidores propios, ni base de
   datos, ni pagos. El plan gratuito de Cloudflare alcanza de sobra
   para partidas entre amigos.

---

## Camino 1: un cambio chiquito, directo desde el navegador

Ideal para retocar textos, palabras de la lista, o colores.

1. Entrá a `github.com/DanoTom/primercontacto` con tu cuenta.
2. Navegá hasta el archivo (por ejemplo `src/palabras.js` para la
   lista de palabras) y tocá el **lápiz** (arriba a la derecha).
3. Hacé el cambio y tocá el botón verde **"Commit changes"**.
4. Esperá un minuto y recargá el juego: ya está publicado.
   Podés mirar al robot trabajando en la pestaña **Actions**.

## Camino 2: cambios grandes, con Claude Code

Para features nuevas, arreglos o lo que se te ocurra:

1. Abrí una sesión de Claude Code (claude.ai/code) sobre este
   repositorio.
2. Pedile el cambio en castellano. Claude programa, prueba y sube.
3. El robot publica solo, igual que siempre.

## Camino 3: probar en tu computadora antes de publicar

1. Cloná el repositorio (una sola vez):
   `git clone https://github.com/DanoTom/primercontacto.git`
2. Dentro de la carpeta: `npm install` (instala las herramientas).
3. `npm run dev` levanta el juego en `http://localhost:8787`.
   Abrilo en varias pestañas para simular varios jugadores.
4. Para correr las **pruebas automáticas** (140+ verificaciones de
   reglas, roles, reconexiones y estrés):
   - en una terminal: `npm run dev:prueba` (el servidor con fases
     cortas: partidas de 8 segundos en vez de 5 minutos)
   - en otra: `npm run probar`
   Si todo dice `TODO OK`, podés publicar tranquilo.

---

## Mapa del proyecto

```
public/          Lo que ve el navegador
  index.html       Las pantallas del aparato
  estilo.css       Toda la estética (chasis, monitor CRT, polaroids)
  app.js           La lógica del cliente (pantallas, terminal, botones)
  sonido.js        Sonido y música sintetizados (Web Audio)
  avatares.js      La lista de los 30 retratos
  img/             Avatares recortados y el extraterrestre
  fuentes/         Las 3 tipografías (VT323, Chakra Petch, Caveat)
src/             El servidor (Cloudflare Worker)
  worker.js        El recepcionista: deriva cada pedido a su sala
  sala.js          UNA SALA = UNA PARTIDA. Todas las reglas viven acá
  palabras.js      Las 140 palabras en 3 dificultades
pruebas/         Las pruebas automáticas por etapa
arte/            Tus placas originales de pixelart
.github/         Los robots: desplegar.yml (publica) y
                 diagnostico.yml (revisa producción)
```

**Regla de oro del código:** el servidor (`src/sala.js`) es la única
autoridad sobre reglas, roles, reloj y palabra secreta. Los celulares
solo muestran estado y envían intenciones. Si agregás una regla nueva,
va en el servidor.

---

## Si algo se rompe

- **¿El juego no responde?** Pestaña **Actions** → workflow
  **Diagnostico** → botón "Run workflow". En un minuto te dice si el
  servidor de producción está sano (crea una sala con 5 jugadores de
  prueba y lee los registros internos).
- **¿Un despliegue falló?** En Actions, el run rojo te muestra el
  error. Lo más común: el secreto `CLOUDFLARE_API_TOKEN` venció o fue
  borrado (ver abajo).
- **¿Quisiste deshacer un cambio?** En GitHub, cada archivo tiene
  "History": podés ver cualquier versión anterior y restaurarla.

## La llave de Cloudflare (el único secreto del proyecto)

El robot publica usando una llave guardada en GitHub:
**Settings → Secrets and variables → Actions → `CLOUDFLARE_API_TOKEN`**.

Si hay que renovarla:
1. En `dash.cloudflare.com/profile/api-tokens` → **Create Token** →
   plantilla **"Edit Cloudflare Workers"** → crear y copiar.
2. En GitHub: Settings → Secrets and variables → Actions →
   `CLOUDFLARE_API_TOKEN` → **Update** → pegar la nueva.

Nada más. Que la señal los acompañe. 🛸
