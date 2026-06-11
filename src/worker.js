// Punto de entrada del servidor.
// Los archivos estáticos (public/) se sirven solos; lo que llega acá
// son las rutas de la API, que se derivan a la Sala correspondiente.

export { Sala } from "./sala.js";

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function generarCodigo() {
  let codigo = "";
  for (let i = 0; i < 4; i++) {
    codigo += LETRAS[Math.floor(Math.random() * LETRAS.length)];
  }
  return codigo;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Crear sala: busca un código de 4 letras que no esté en uso.
    if (url.pathname === "/api/crear" && request.method === "POST") {
      for (let intento = 0; intento < 8; intento++) {
        const codigo = generarCodigo();
        const sala = env.SALAS.get(env.SALAS.idFromName(codigo));
        const respuesta = await sala.fetch(
          new Request(`https://interno/api/sala/${codigo}/estado`)
        );
        const estado = await respuesta.json();
        if (estado.jugadores === 0 && estado.fase === "lobby") {
          return Response.json({ codigo });
        }
      }
      return Response.json(
        { error: "FRECUENCIAS SATURADAS. INTENTÁ DE NUEVO." },
        { status: 503 }
      );
    }

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
