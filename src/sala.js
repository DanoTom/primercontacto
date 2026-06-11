// La Sala: un Durable Object por cada sala de juego.
// Todo el estado de la partida vive acá, en memoria del objeto.
//
// Etapa 1: lobby. Los jugadores se unen con nombre y avatar,
// se ven entre sí en tiempo real, y el creador puede iniciar
// la transmisión cuando hay 4 o más.
//
// Nota sobre hibernación: la sala puede "dormirse" entre mensajes
// para no gastar el plan gratuito. Por eso los datos de cada jugador
// se guardan adheridos a su conexión (serializeAttachment), que
// sobrevive la hibernación, y la fase de la partida en storage.

import { DurableObject } from "cloudflare:workers";

const MAX_JUGADORES = 8;
const MIN_JUGADORES = 4;
const MAX_NOMBRE = 12;
const CANT_AVATARES = 8;

export class Sala extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);

    // Consulta interna del Worker para saber si el código está libre.
    if (url.pathname.endsWith("/estado")) {
      return Response.json({
        fase: await this.fase(),
        jugadores: this.jugadores().length,
      });
    }

    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);
      this.ctx.acceptWebSocket(servidor);
      return new Response(null, { status: 101, webSocket: cliente });
    }

    return Response.json({ ok: true, mensaje: "SALA ACTIVA" });
  }

  async fase() {
    return (await this.ctx.storage.get("fase")) || "lobby";
  }

  // Reconstruye la lista de jugadores desde las conexiones vivas.
  // El orden de llegada define quién es el creador (el primero).
  // "excluir" permite omitir una conexión que se está cerrando
  // (todavía figura en la lista durante el aviso de cierre).
  jugadores(excluir = null) {
    const lista = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excluir) continue;
      const datos = ws.deserializeAttachment();
      if (datos) lista.push(datos);
    }
    lista.sort((a, b) => a.orden - b.orden || (a.id < b.id ? -1 : 1));
    return lista;
  }

  async webSocketMessage(ws, dato) {
    let msg;
    try {
      msg = JSON.parse(dato);
    } catch {
      return;
    }

    switch (msg.tipo) {
      case "unirse":
        await this.manejarUnirse(ws, msg);
        break;
      case "iniciar":
        await this.manejarIniciar(ws);
        break;
    }
  }

  async manejarUnirse(ws, msg) {
    if (ws.deserializeAttachment()) return; // ya está unido

    if ((await this.fase()) !== "lobby") {
      return this.rechazar(ws, "TRANSMISIÓN EN CURSO. NO SE ADMITEN NUEVOS OPERADORES.");
    }

    const jugadores = this.jugadores();
    if (jugadores.length >= MAX_JUGADORES) {
      return this.rechazar(ws, "ESTACIÓN COMPLETA. CAPACIDAD MÁXIMA: 8 OPERADORES.");
    }

    const nombre = String(msg.nombre || "").trim().slice(0, MAX_NOMBRE);
    if (!nombre) {
      return this.rechazar(ws, "IDENTIFICACIÓN REQUERIDA. INGRESÁ TU NOMBRE.");
    }
    const repetido = jugadores.some(
      (j) => j.nombre.toLowerCase() === nombre.toLowerCase()
    );
    if (repetido) {
      return this.rechazar(ws, "ESE NOMBRE YA ESTÁ EN USO EN ESTA ESTACIÓN.");
    }

    const avatar = Number.isInteger(msg.avatar) && msg.avatar >= 0 && msg.avatar < CANT_AVATARES
      ? msg.avatar
      : 0;

    // El contador de orden persiste para que el creador siga siendo
    // el primero aunque la sala hiberne.
    const orden = (await this.ctx.storage.get("orden")) || 0;
    await this.ctx.storage.put("orden", orden + 1);

    const jugador = {
      id: crypto.randomUUID(),
      nombre,
      avatar,
      orden,
    };
    ws.serializeAttachment(jugador);

    this.enviar(ws, { tipo: "bienvenida", tuId: jugador.id });
    this.difundirLobby();
  }

  async manejarIniciar(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "lobby") return;

    const jugadores = this.jugadores();
    if (jugadores[0].id !== yo.id) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "SOLO EL JEFE DE ESTACIÓN PUEDE INICIAR LA TRANSMISIÓN.",
      });
    }
    if (jugadores.length < MIN_JUGADORES) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: `SE REQUIEREN ${MIN_JUGADORES} OPERADORES COMO MÍNIMO.`,
      });
    }

    await this.ctx.storage.put("fase", "partida");
    this.difundir({ tipo: "faseCambio", fase: "partida" });
  }

  async webSocketClose(ws) {
    await this.manejarDesconexion(ws);
  }

  async webSocketError(ws) {
    await this.manejarDesconexion(ws);
  }

  async manejarDesconexion(ws) {
    const restantes = this.ctx.getWebSockets().filter((s) => s !== ws);
    // Si la sala quedó vacía, su estado muere (sin base de datos:
    // la próxima vez que alguien use este código, arranca de cero).
    if (restantes.length === 0) {
      await this.ctx.storage.deleteAll();
      return;
    }
    if ((await this.fase()) === "lobby") {
      this.difundirLobby(ws);
    }
  }

  difundirLobby(excluir = null) {
    const jugadores = this.jugadores(excluir);
    this.difundir({
      tipo: "lobby",
      creadorId: jugadores.length ? jugadores[0].id : null,
      jugadores: jugadores.map((j) => ({
        id: j.id,
        nombre: j.nombre,
        avatar: j.avatar,
      })),
    });
  }

  rechazar(ws, mensaje) {
    this.enviar(ws, { tipo: "error", mensaje });
    ws.close(4000, mensaje);
  }

  enviar(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // Conexión muerta: se limpia sola.
    }
  }

  difundir(obj) {
    const dato = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(dato);
      } catch {
        // Conexión muerta: se limpia sola.
      }
    }
  }
}
