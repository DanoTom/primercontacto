// La Sala: un Durable Object por cada sala de juego.
// Todo el estado de la partida va a vivir acá, en memoria.
//
// Etapa 0: hola mundo. La sala acepta conexiones WebSocket,
// difunde cuántas pestañas hay conectadas y reenvía "pings"
// a todos, para comprobar que el tiempo real funciona.

import { DurableObject } from "cloudflare:workers";

export class Sala extends DurableObject {
  async fetch(request) {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade && upgrade.toLowerCase() === "websocket") {
      const par = new WebSocketPair();
      const [cliente, servidor] = Object.values(par);

      // Hibernation API: la sala puede "dormirse" entre mensajes
      // sin cortar las conexiones (clave para el plan gratuito).
      this.ctx.acceptWebSocket(servidor);

      this.difundirConteo();
      return new Response(null, { status: 101, webSocket: cliente });
    }

    return Response.json({ ok: true, mensaje: "SALA ACTIVA" });
  }

  // Llega un mensaje de cualquier jugador conectado.
  webSocketMessage(ws, dato) {
    let msg;
    try {
      msg = JSON.parse(dato);
    } catch {
      return;
    }

    if (msg.tipo === "ping") {
      this.difundir({ tipo: "ping", hora: new Date().toISOString() });
    }
  }

  webSocketClose() {
    this.difundirConteo();
  }

  webSocketError() {
    this.difundirConteo();
  }

  difundirConteo() {
    this.difundir({
      tipo: "conteo",
      conectados: this.ctx.getWebSockets().length,
    });
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
