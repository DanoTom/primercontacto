// La Sala: un Durable Object por cada sala de juego.
// Todo el estado de la partida vive acá, en memoria del objeto.
//
// Etapa 2: la Terminal en vivo. La sala retransmite el tecleo de
// cada jugador (borradores, con borrones) y los mensajes enviados,
// con un color de fósforo propio por jugador.
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
const CANT_COLORES = 8;
const MAX_MENSAJE = 200;
const MAX_HISTORIAL = 200;

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

  // La fase se cachea en memoria: el tecleo llega cada ~100 ms
  // y no queremos consultar el storage en cada ráfaga.
  async fase() {
    if (this._fase === undefined) {
      this._fase = (await this.ctx.storage.get("fase")) || "lobby";
    }
    return this._fase;
  }

  async cambiarFase(fase) {
    this._fase = fase;
    await this.ctx.storage.put("fase", fase);
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
      case "tecleo":
        await this.manejarTecleo(ws, msg);
        break;
      case "enviar":
        await this.manejarEnviar(ws, msg);
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

    // Color de fósforo: el más bajo que no esté usando nadie,
    // así nunca hay dos jugadores activos con el mismo.
    const usados = new Set(jugadores.map((j) => j.color));
    let color = 0;
    while (usados.has(color) && color < CANT_COLORES - 1) color++;

    const jugador = {
      id: crypto.randomUUID(),
      nombre,
      avatar,
      color,
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

    await this.cambiarFase("partida");
    this.difundir({
      tipo: "faseCambio",
      fase: "partida",
      jugadores: this.fichas(),
    });
  }

  // Datos públicos de los jugadores (sin el orden interno).
  fichas() {
    return this.jugadores().map((j) => ({
      id: j.id,
      nombre: j.nombre,
      avatar: j.avatar,
      color: j.color,
    }));
  }

  // ─── La Terminal ───

  // Borrador en curso: se retransmite a todos menos a quien teclea
  // (que ya ve su propio texto en el campo de entrada).
  async manejarTecleo(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;

    const texto = String(msg.texto ?? "").slice(0, MAX_MENSAJE);
    this.difundir({ tipo: "tecleo", jugadorId: yo.id, texto }, ws);
  }

  // Mensaje enviado (Enter): pasa al historial y se difunde a todos.
  async manejarEnviar(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;

    const texto = String(msg.texto ?? "").trim().slice(0, MAX_MENSAJE);
    if (!texto) return;

    const mensaje = {
      tipo: "mensaje",
      jugadorId: yo.id,
      nombre: yo.nombre,
      color: yo.color,
      texto,
    };
    if (!this.historial) this.historial = [];
    this.historial.push(mensaje);
    if (this.historial.length > MAX_HISTORIAL) this.historial.shift();

    this.difundir(mensaje);
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
      this._fase = undefined;
      this.historial = [];
      return;
    }
    const fase = await this.fase();
    if (fase === "lobby") {
      this.difundirLobby(ws);
    } else if (fase === "partida") {
      // Borra la línea viva de quien se fue, si estaba tecleando.
      const yo = ws.deserializeAttachment();
      if (yo) {
        this.difundir({ tipo: "tecleo", jugadorId: yo.id, texto: "" }, ws);
      }
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

  difundir(obj, excluir = null) {
    const dato = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === excluir) continue;
      try {
        ws.send(dato);
      } catch {
        // Conexión muerta: se limpia sola.
      }
    }
  }
}
