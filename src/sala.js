// La Sala: un Durable Object por cada sala de juego.
// Todo el estado de la partida vive acá. El servidor es la autoridad:
// el reloj, los roles, la palabra y la validación se deciden acá;
// los clientes solo muestran estado y envían intenciones.
//
// Fases: lobby → revelacion → partida → juicio → final → (revancha) lobby
// El reloj de cada fase se hace cumplir con una alarma del Durable
// Object (sobrevive hibernaciones). Lo crítico (fase, roles, palabra,
// vencimiento, votos) se persiste en storage por la misma razón;
// el historial y los borradores son efímeros y viven en memoria.

import { DurableObject } from "cloudflare:workers";
import { PALABRAS } from "./palabras.js";

const MAX_JUGADORES = 8;
const MIN_JUGADORES = 4;
const MAX_NOMBRE = 12;
const CANT_AVATARES = 30;
const CANT_COLORES = 8;
const MAX_MENSAJE = 200;
const MAX_HISTORIAL = 200;
const PAUSA_RESPUESTA = 1500; // freno anti-spam de los botones del Contactado

const DIFICULTADES = ["facil", "media", "dificil"];

const RESPUESTAS = {
  si: "SÍ",
  no: "NO",
  inestable: "SEÑAL INESTABLE",
  fuerte: "SEÑAL FUERTE",
  debil: "SEÑAL DÉBIL",
};

// Insensible a mayúsculas y tildes ("colibri" vale por "colibrí"),
// pero la ñ se preserva (campana ≠ campaña): se aparta con un
// marcador antes de quitar los acentos y se restituye después.
function normalizar(texto) {
  return texto
    .toLowerCase()
    .replaceAll("\u00f1", "\u0001")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("\u0001", "\u00f1");
}

function barajar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

export class Sala extends DurableObject {
  // Con MODO_PRUEBA las fases duran segundos en vez de minutos,
  // para que las pruebas automáticas no esperen 5 minutos reales.
  duraciones() {
    if (this.env.MODO_PRUEBA === "1") {
      return {
        revelacion: 2500,
        partida: 8000,
        juicio: 3000,
        interferencia: 1500,
        costoTransmision: 2000,
        umbralTransmision: 3000,
        bonoReinicio: 3000,
      };
    }
    return {
      revelacion: 30_000,
      partida: 300_000,
      juicio: 60_000,
      interferencia: 15_000, // botones del Contactado apagados
      costoTransmision: 45_000, // lo que resta al reloj la primera letra
      umbralTransmision: 60_000, // mínimo restante para poder transmitir
      bonoReinicio: 60_000, // compensación al cambiar la palabra
    };
  }

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

  // ─── Estado básico ───

  async leer(clave, defecto) {
    const valor = await this.ctx.storage.get(clave);
    return valor === undefined ? defecto : valor;
  }

  async fase() {
    if (this._fase === undefined) {
      this._fase = await this.leer("fase", "lobby");
    }
    return this._fase;
  }

  async cambiarFase(fase) {
    this._fase = fase;
    await this.ctx.storage.put("fase", fase);
  }

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

  fichas() {
    return this.jugadores().map((j) => ({
      id: j.id,
      nombre: j.nombre,
      avatar: j.avatar,
      color: j.color,
    }));
  }

  async rolDe(jugadorId) {
    const roles = await this.leer("roles", {});
    return roles[jugadorId];
  }

  async contactadoId() {
    const roles = await this.leer("roles", {});
    for (const [id, rol] of Object.entries(roles)) {
      if (rol === "contactado") return id;
    }
    return null;
  }

  async metamorfoId() {
    const roles = await this.leer("roles", {});
    for (const [id, rol] of Object.entries(roles)) {
      if (rol === "metamorfo") return id;
    }
    return null;
  }

  // ─── Mensajes entrantes ───

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
      case "dificultad":
        await this.manejarDificultad(ws, msg);
        break;
      case "iniciar":
        await this.manejarIniciar(ws);
        break;
      case "entendido":
        await this.manejarEntendido(ws);
        break;
      case "tecleo":
        await this.manejarTecleo(ws, msg);
        break;
      case "enviar":
        await this.manejarEnviar(ws, msg);
        break;
      case "respuesta":
        await this.manejarRespuesta(ws, msg);
        break;
      case "emergencia":
        await this.manejarEmergencia(ws);
        break;
      case "votar":
        await this.manejarVotar(ws, msg);
        break;
      case "revancha":
        await this.manejarRevancha(ws);
        break;
    }
  }

  // ─── Lobby ───

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

    // Color de fósforo: el más bajo que no esté usando nadie.
    const usados = new Set(jugadores.map((j) => j.color));
    let color = 0;
    while (usados.has(color) && color < CANT_COLORES - 1) color++;

    // El contador de orden persiste para que el creador siga siendo
    // el primero aunque la sala hiberne.
    const orden = await this.leer("orden", 0);
    await this.ctx.storage.put("orden", orden + 1);

    const jugador = { id: crypto.randomUUID(), nombre, avatar, color, orden };
    ws.serializeAttachment(jugador);

    this.enviar(ws, { tipo: "bienvenida", tuId: jugador.id });
    await this.difundirLobby();
  }

  async manejarDificultad(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "lobby") return;
    if (this.jugadores()[0]?.id !== yo.id) return; // solo el creador
    if (!DIFICULTADES.includes(msg.valor)) return;

    await this.ctx.storage.put("dificultad", msg.valor);
    await this.difundirLobby();
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

    // Roles al azar: 1 contactado, 1 metamorfo, el resto investigadores.
    const ids = barajar(jugadores.map((j) => j.id));
    const roles = {};
    ids.forEach((id, i) => {
      roles[id] = i === 0 ? "contactado" : i === 1 ? "metamorfo" : "investigador";
    });

    const dificultad = await this.leer("dificultad", "media");
    const lista = PALABRAS[dificultad];
    const palabra = lista[Math.floor(Math.random() * lista.length)];

    const finFase = Date.now() + this.duraciones().revelacion;
    await this.ctx.storage.put({
      roles,
      palabra,
      finFase,
      usos: { interferencia: false, transmision: false, reinicio: false },
      votosReinicio: [],
    });
    await this.cambiarFase("revelacion");
    await this.ctx.storage.setAlarm(finFase);
    this.confirmados = new Set();
    this.historial = [];

    // Revelación privada: la palabra solo viaja a quien debe conocerla.
    const fichas = this.fichas();
    for (const socket of this.ctx.getWebSockets()) {
      const j = socket.deserializeAttachment();
      if (!j) continue;
      const rol = roles[j.id];
      this.enviar(socket, {
        tipo: "rol",
        rol,
        palabra: rol === "investigador" ? undefined : palabra,
        jugadores: fichas,
        contactadoId: ids[0],
      });
    }
  }

  async manejarEntendido(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "revelacion") return;

    if (!this.confirmados) this.confirmados = new Set();
    this.confirmados.add(yo.id);

    const total = this.jugadores().length;
    this.difundir({ tipo: "confirmados", cantidad: this.confirmados.size, total });

    if (this.confirmados.size >= total) {
      await this.empezarPartida();
    }
  }

  async empezarPartida() {
    if ((await this.fase()) !== "revelacion") return;

    const duracion = this.duraciones().partida;
    const finFase = Date.now() + duracion;
    await this.ctx.storage.put("finFase", finFase);
    await this.cambiarFase("partida");
    await this.ctx.storage.setAlarm(finFase);

    this.difundir({
      tipo: "faseCambio",
      fase: "partida",
      restanteMs: duracion,
      jugadores: this.fichas(),
      contactadoId: await this.contactadoId(),
    });
  }

  // ─── La Terminal ───

  async manejarTecleo(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;
    if ((await this.rolDe(yo.id)) === "contactado") return; // no tiene teclado

    const texto = String(msg.texto ?? "").slice(0, MAX_MENSAJE);
    this.difundir({ tipo: "tecleo", jugadorId: yo.id, texto }, ws);
  }

  async manejarEnviar(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;
    if ((await this.rolDe(yo.id)) === "contactado") return;

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

    // Victoria por descifrado: la palabra apareció en un mensaje
    // enviado (de quien sea: si la escribe el Metamorfo, es su riesgo).
    const palabra = await this.leer("palabra", null);
    if (palabra && this.contieneLaPalabra(texto, palabra)) {
      await this.finalizar("humanos", "descifrado");
    }
  }

  // La palabra cuenta como palabra entera del mensaje, normalizada:
  // "Es un COLIBRI?" descubre "colibrí", pero "faraón" no descubre "faro".
  contieneLaPalabra(texto, palabra) {
    const objetivo = normalizar(palabra);
    return normalizar(texto)
      .split(/[^a-zñ0-9]+/)
      .includes(objetivo);
  }

  async manejarRespuesta(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;
    if ((await this.rolDe(yo.id)) !== "contactado") return;
    if (!RESPUESTAS[msg.valor]) return;

    // Botones saboteados por la Interferencia: la respuesta no sale.
    if (Date.now() < (await this.leer("interferenciaHasta", 0))) return;

    const ahora = Date.now();
    if (this.ultimaRespuesta && ahora - this.ultimaRespuesta < PAUSA_RESPUESTA) return;
    this.ultimaRespuesta = ahora;

    this.sistema(`EL CONTACTADO RESPONDE: ${RESPUESTAS[msg.valor]}`, msg.valor);
  }

  // ─── Acciones de riesgo (botón EMERGENCIA, un uso por partida) ───

  // El cliente manda una intención genérica; el servidor decide qué
  // acción corresponde según el rol. Así nadie puede ejecutar la de otro.
  async manejarEmergencia(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "partida") return;

    const rol = await this.rolDe(yo.id);
    if (rol === "metamorfo") await this.accionInterferencia(ws, yo);
    else if (rol === "contactado") await this.accionTransmision(ws);
    else if (rol === "investigador") await this.accionReinicio(ws, yo);
  }

  // Metamorfo: apaga los botones del Contactado. Costo: micro-glitch
  // visual en su avatar, visible para todos los que estén mirando.
  async accionInterferencia(ws, yo) {
    const usos = await this.leer("usos", {});
    if (usos.interferencia) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "INTERFERENCIA AGOTADA: ERA DE UN SOLO USO.",
      });
    }
    usos.interferencia = true;
    const duracion = this.duraciones().interferencia;
    await this.ctx.storage.put({
      usos,
      interferenciaHasta: Date.now() + duracion,
    });

    this.difundir({ tipo: "glitch", jugadorId: yo.id });
    await this.enviarAlRol("contactado", { tipo: "interferencia", duracionMs: duracion });
    this.enviar(ws, { tipo: "emergenciaConfirmada", accion: "interferencia" });
  }

  // Contactado: transmite la primera letra de la palabra,
  // a cambio de quemar reloj. No alcanza la señal si queda poco.
  async accionTransmision(ws) {
    const d = this.duraciones();
    const usos = await this.leer("usos", {});
    if (usos.transmision) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "TRANSMISIÓN DE EMERGENCIA AGOTADA: ERA DE UN SOLO USO.",
      });
    }
    const finFase = await this.leer("finFase", 0);
    if (finFase - Date.now() < d.umbralTransmision) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "SEÑAL DEMASIADO DÉBIL: NO ALCANZA PARA TRANSMITIR.",
      });
    }

    usos.transmision = true;
    const nuevoFin = finFase - d.costoTransmision;
    await this.ctx.storage.put({ usos, finFase: nuevoFin });
    await this.ctx.storage.setAlarm(nuevoFin);

    const palabra = await this.leer("palabra", "?");
    this.sistema(
      `TRANSMISIÓN DE EMERGENCIA: LA PALABRA COMIENZA CON «${palabra[0].toUpperCase()}»`
    );
    this.difundir({ tipo: "reloj", restanteMs: nuevoFin - Date.now() });
    this.enviar(ws, { tipo: "emergenciaConfirmada", accion: "transmision" });
  }

  // Investigadores: cuando TODOS presionan REINICIO, la palabra cambia
  // y el reloj recibe compensación. Los botones presionados quedan trabados.
  async accionReinicio(ws, yo) {
    const usos = await this.leer("usos", {});
    if (usos.reinicio) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "EL REINICIO DE SISTEMA YA FUE EJECUTADO.",
      });
    }
    const votos = await this.leer("votosReinicio", []);
    if (!votos.includes(yo.id)) {
      votos.push(yo.id);
      await this.ctx.storage.put("votosReinicio", votos);
    }
    this.enviar(ws, { tipo: "emergenciaConfirmada", accion: "reinicio" });
    await this.evaluarReinicio();
  }

  async evaluarReinicio(excluir = null) {
    const usos = await this.leer("usos", {});
    if (usos.reinicio) return;

    const roles = await this.leer("roles", {});
    const investigadores = this.jugadores(excluir).filter(
      (j) => roles[j.id] === "investigador"
    );
    const votos = await this.leer("votosReinicio", []);
    const presionados = investigadores.filter((j) => votos.includes(j.id)).length;
    const total = investigadores.length;

    // El indicador de cuántos faltan solo lo ven los Investigadores.
    await this.enviarAlRol("investigador", { tipo: "reinicioEstado", presionados, total });

    if (total > 0 && presionados >= total) {
      await this.ejecutarReinicio();
    }
  }

  async ejecutarReinicio() {
    const d = this.duraciones();
    const usos = await this.leer("usos", {});
    usos.reinicio = true;

    const dificultad = await this.leer("dificultad", "media");
    const actual = await this.leer("palabra", null);
    const lista = PALABRAS[dificultad].filter((p) => p !== actual);
    const palabra = lista[Math.floor(Math.random() * lista.length)];

    const finFase = await this.leer("finFase", 0);
    const nuevoFin = finFase + d.bonoReinicio;
    await this.ctx.storage.put({ usos, palabra, finFase: nuevoFin, votosReinicio: [] });
    await this.ctx.storage.setAlarm(nuevoFin);

    this.sistema("REINICIO DE SISTEMA EJECUTADO. NUEVA PALABRA ASIGNADA. SEÑAL EXTENDIDA.");
    this.difundir({ tipo: "reloj", restanteMs: nuevoFin - Date.now() });
    // Superposición privada: solo quienes deben conocer la palabra nueva.
    await this.enviarAlRol("contactado", { tipo: "palabraNueva", palabra });
    await this.enviarAlRol("metamorfo", { tipo: "palabraNueva", palabra });
  }

  async enviarAlRol(rol, obj) {
    const roles = await this.leer("roles", {});
    for (const s of this.ctx.getWebSockets()) {
      const j = s.deserializeAttachment();
      if (j && roles[j.id] === rol) this.enviar(s, obj);
    }
  }

  sistema(texto, subtipo = null) {
    const msg = { tipo: "sistema", subtipo, texto };
    if (!this.historial) this.historial = [];
    this.historial.push(msg);
    if (this.historial.length > MAX_HISTORIAL) this.historial.shift();
    this.difundir(msg);
  }

  // ─── El reloj de la sala (alarma del Durable Object) ───

  async alarm() {
    const fase = await this.fase();
    if (fase === "revelacion") {
      await this.empezarPartida();
    } else if (fase === "partida") {
      await this.empezarJuicio();
    } else if (fase === "juicio") {
      await this.resolverJuicio();
    }
  }

  // ─── El Juicio Final ───

  async empezarJuicio() {
    if ((await this.fase()) !== "partida") return;

    const duracion = this.duraciones().juicio;
    const finFase = Date.now() + duracion;
    await this.ctx.storage.put({ finFase, votos: {} });
    await this.cambiarFase("juicio");
    await this.ctx.storage.setAlarm(finFase);

    this.difundir({
      tipo: "faseCambio",
      fase: "juicio",
      restanteMs: duracion,
      contactadoId: await this.contactadoId(),
    });
  }

  async manejarVotar(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "juicio") return;

    const objetivoId = String(msg.objetivoId || "");
    const roles = await this.leer("roles", {});
    if (!roles[objetivoId]) return; // no es un jugador de esta partida
    if (roles[objetivoId] === "contactado") {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "NO PODÉS VOTAR AL CONTACTADO: SU ROL ES PÚBLICO.",
      });
    }

    const votos = await this.leer("votos", {});
    if (votos[yo.id]) return; // el voto es uno solo y queda sellado
    votos[yo.id] = objetivoId;
    await this.ctx.storage.put("votos", votos);

    this.enviar(ws, { tipo: "votoRegistrado" });
    const total = this.jugadores().length;
    this.difundir({ tipo: "votos", cantidad: Object.keys(votos).length, total });

    if (Object.keys(votos).length >= total) {
      await this.resolverJuicio();
    }
  }

  async resolverJuicio() {
    if ((await this.fase()) !== "juicio") return;

    const votos = await this.leer("votos", {});
    const metamorfoId = await this.metamorfoId();

    const conteo = {};
    for (const objetivoId of Object.values(votos)) {
      conteo[objetivoId] = (conteo[objetivoId] || 0) + 1;
    }
    const entradas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);

    // Gana el equipo humano solo si el más votado es el Metamorfo,
    // sin empate en el primer puesto. Abstenciones no suman.
    let ganador = "metamorfo";
    if (entradas.length > 0) {
      const [topId, topVotos] = entradas[0];
      const empate = entradas.length > 1 && entradas[1][1] === topVotos;
      if (!empate && topId === metamorfoId) ganador = "humanos";
    }

    await this.finalizar(ganador, "votacion", {
      recuento: entradas.map(([id, cantidad]) => ({ id, votos: cantidad })),
    });
  }

  // ─── Final y revancha ───

  async finalizar(ganador, motivo, extra = {}) {
    await this.cambiarFase("final");
    await this.ctx.storage.deleteAlarm();

    this.difundir({
      tipo: "faseCambio",
      fase: "final",
      resultado: {
        ganador,
        motivo,
        palabra: await this.leer("palabra", null),
        metamorfoId: await this.metamorfoId(),
        contactadoId: await this.contactadoId(),
        ...extra,
      },
    });
  }

  async manejarRevancha(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "final") return;

    await this.ctx.storage.delete([
      "palabra", "roles", "finFase", "votos",
      "usos", "votosReinicio", "interferenciaHasta",
    ]);
    await this.cambiarFase("lobby");
    this.historial = [];
    this.confirmados = new Set();
    this.ultimaRespuesta = 0;

    this.difundir({ tipo: "faseCambio", fase: "lobby" });
    await this.difundirLobby();
  }

  // ─── Desconexiones ───

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
      await this.ctx.storage.deleteAlarm();
      this._fase = undefined;
      this.historial = [];
      this.confirmados = new Set();
      return;
    }

    const fase = await this.fase();
    if (fase === "lobby") {
      await this.difundirLobby(ws);
    } else if (fase === "partida") {
      // Borra la línea viva de quien se fue, si estaba tecleando.
      const yo = ws.deserializeAttachment();
      if (yo) {
        this.difundir({ tipo: "tecleo", jugadorId: yo.id, texto: "" }, ws);
      }
      // Si se fue un investigador que faltaba para el Reinicio,
      // el umbral baja y puede completarse ahora.
      await this.evaluarReinicio(ws);
    } else if (fase === "juicio") {
      // Si los que quedan ya votaron todos, no hay que esperar más.
      const votos = await this.leer("votos", {});
      if (Object.keys(votos).length >= this.jugadores(ws).length) {
        await this.resolverJuicio();
      }
    }
  }

  // ─── Difusión ───

  async difundirLobby(excluir = null) {
    const jugadores = this.jugadores(excluir);
    this.difundir({
      tipo: "lobby",
      creadorId: jugadores.length ? jugadores[0].id : null,
      dificultad: await this.leer("dificultad", "media"),
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
