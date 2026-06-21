# 🌫️ RÍO MANSO

Juego web multijugador en tiempo real, para 3 a 8 amigos desde el
celular. Un grupo llega a una cabaña junto al Río Manso y empiezan las
desapariciones. Un viejo aparato les presenta una serie de **desafíos
de rapidez** contra reloj: quien falla o no contesta a tiempo es
"desaparecido" por el Río. Es **colaborativo**: si al menos uno llega
al amanecer, gana todo el grupo. Si el Río se los lleva a todos,
pierden. Pero nadie quiere ser el próximo.

**▶ Jugar:** https://primer-contacto.danotommasi.workers.dev

## Cómo se juega

1. Alguien crea la partida y comparte el código de 4 letras.
2. Con 3 o más personas, empieza la noche.
3. Cada ronda es un desafío contra reloj (el tiempo se acorta ronda a
   ronda). Tocá tu respuesta antes de que se corte.
4. Si errás o no llegás, el Río te desaparece... pero conservás **una
   ayuda** para gastar sobre alguien vivo: una **pista** (le tacha
   opciones) o un **escudo** (lo salva si falla esa ronda).
5. Si alguien llega al final, gana el grupo.

### Los desafíos

- **El color miente** — una palabra-color pintada de otro color; tocá la tinta.
- **El intruso** — tres cosas de un grupo y una colada de otra.
- **La cuenta** — aritmética contra reloj.
- **El patrón** — ¿qué número sigue?
- **Encontrá el distinto** — una grilla de triángulos, uno girado distinto.
- **¿Cuántos hay?** — contá las figuras de una clase.
- **¿Qué figura sigue?** — una secuencia visual.
- **Luz verde** — esperá la señal y tocá; si te adelantás, caés.

## Tecnología

- **Frontend:** HTML + CSS + JavaScript vanilla. Estética retro sci-fi:
  monitor CRT, plástico ochentoso, sonido y música sintetizados (Web Audio).
- **Backend:** Cloudflare Workers + Durable Objects (una sala = un
  objeto con memoria propia). WebSockets con Hibernation API. Sin base
  de datos: el estado muere cuando la sala se vacía. Costo: $0.
- **El servidor es la autoridad:** reloj, desafíos, respuestas correctas
  y eliminaciones viven en `src/`. Los clientes solo muestran y piden.

## Estructura

```
public/          Lo que ve el navegador (index.html, estilo.css, app.js,
                 sonido.js, avatares.js, img/, fuentes/)
src/
  worker.js        Recepcionista: deriva cada pedido a su sala
  sala.js          UNA SALA = UNA PARTIDA. El bucle de rondas vive acá
  desafios.js      Los desafíos (uno por módulo)
pruebas/         Pruebas automáticas (contenido, riomanso, luzverde)
arte/            Placas originales de pixelart
```

## Desarrollo

```bash
npm install        # una sola vez
npm run dev        # juego local en http://localhost:8787
npm run dev:prueba # servidor con rondas cortas (para las pruebas)
npm run probar     # pruebas de contenido + servidor (en otra terminal)
```

Cada push a `main` se publica automáticamente vía GitHub Actions.
Guía completa en lenguaje simple: **[COMO-ACTUALIZAR.md](COMO-ACTUALIZAR.md)**

> El juego anterior, *Primer Contacto* (deducción social), quedó
> archivado en la rama `primer-contacto`.

## Créditos

Diseño de juego y pixelart: **DanoTom** · Código: construido con Claude Code.
