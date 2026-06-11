// Punto de entrada del servidor.
// Los archivos estáticos (public/) se sirven solos; lo que llega acá
// son las rutas de la API, que se derivan a la Sala correspondiente.

export { Sala } from "./sala.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Rutas tipo /api/sala/ABCD/... → Durable Object de esa sala.
    const match = url.pathname.match(/^\/api\/sala\/([A-Za-z]{4})(\/|$)/);
    if (match) {
      const codigo = match[1].toUpperCase();
      const id = env.SALAS.idFromName(codigo);
      const sala = env.SALAS.get(id);
      return sala.fetch(request);
    }

    return new Response("SEÑAL NO ENCONTRADA. VERIFICÁ EL CÓDIGO DE SALA.", {
      status: 404,
    });
  },
};
