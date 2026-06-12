# 🛸 PRIMER CONTACTO

Juego web multijugador de deducción social en tiempo real, para 4 a 8
amigos desde el celular. Un equipo humano interceptó una transmisión
alienígena —una palabra secreta— y tiene 5 minutos para descifrarla
interrogando al **Contactado**, que solo responde con 5 botones. Pero
hay un **Metamorfo** infiltrado saboteando desde adentro... y en la
Terminal compartida **todos ven lo que todos teclean, letra por letra,
borrones incluidos**. Dudar es evidencia.

**▶ Jugar:** https://primer-contacto.danotommasi.workers.dev

## Cómo se juega

1. Alguien crea una sala y comparte el código de 4 letras.
2. Con 4 o más operadores, arranca la transmisión: roles secretos.
3. Los Investigadores preguntan por sí/no; el Contactado responde con
   sus botones; el Metamorfo finge ayudar mientras quema el reloj.
4. ¿Alguien escribe la palabra exacta? Ganan los humanos.
   ¿Se acaba el tiempo? Votación secreta: ¿quién es el Metamorfo?
5. Cada rol esconde un botón de EMERGENCIA de un solo uso. Todo tiene
   un costo.

## Tecnología

- **Frontend:** HTML + CSS + JavaScript vanilla. Estética de aparato
  ochentoso hecho en un garaje: monitor CRT, plástico beige, polaroids
  pixelart, sonido y música sintetizados con Web Audio.
- **Backend:** Cloudflare Workers + Durable Objects (una sala = un
  objeto con memoria propia). WebSockets con Hibernation API. Sin base
  de datos: el estado muere cuando la sala se vacía. Costo: $0.
- **El servidor es la autoridad:** reloj, roles, palabra y validación
  viven en `src/sala.js`. Los clientes solo muestran y piden.

## Desarrollo

```bash
npm install        # una sola vez
npm run dev        # juego local en http://localhost:8787
npm run dev:prueba # servidor con fases cortas (para las pruebas)
npm run probar     # 140+ verificaciones automáticas (en otra terminal)
```

Cada push a `main` se publica automáticamente vía GitHub Actions.
Guía completa en lenguaje simple: **[COMO-ACTUALIZAR.md](COMO-ACTUALIZAR.md)**

## Créditos

Diseño de juego y pixelart: **DanoTom** · Código: construido con
Claude Code.
