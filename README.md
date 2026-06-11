# PRIMER CONTACTO

Juego web multijugador de deducción social, en tiempo real, para 4 a 8
jugadores desde el celular. Un equipo humano intenta descifrar una palabra
secreta interrogando al Contactado, mientras un Metamorfo infiltrado
sabotea desde adentro.

## Estructura del proyecto

```
primercontacto/
├── public/          → Lo que ve el navegador (HTML, CSS, JS del juego)
├── src/             → El servidor (Cloudflare Worker + Durable Objects)
│   ├── worker.js    → Punto de entrada: dirige el tráfico a cada sala
│   └── sala.js      → Una Sala = una partida. Todo el estado vive acá
├── wrangler.jsonc   → Configuración de Cloudflare
└── package.json     → Dependencias y comandos del proyecto
```

## Cómo probar en tu computadora

1. Instalar dependencias (solo la primera vez):

   ```
   npm install
   ```

2. Levantar el servidor local:

   ```
   npm run dev
   ```

3. Abrir `http://localhost:8787` en el navegador. Para probar el
   multijugador, abrí la misma dirección en varias pestañas.
