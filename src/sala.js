// La Sala: un Durable Object por cada partida de RÍO MANSO.
// El servidor es la autoridad: el reloj, los desafíos, la respuesta
// correcta y las eliminaciones se deciden acá; los clientes solo
// muestran estado y envían intenciones.
//
// Un grupo de amigos en una cabaña enfrenta los desafíos del Río Manso.
// Cada ronda es una prueba de rapidez: quien falla o no contesta a
// tiempo es "desaparecido". Si al menos uno llega al final, el grupo
// gana. Si el Río se los lleva a todos, pierden.
//
// Fases: lobby → intro → ronda → resolucion → (loop) → final → lobby
// El reloj de cada fase se hace cumplir con una alarma del Durable
// Object (sobrevive hibernaciones); lo crítico se persiste en storage.

import { DurableObject } from "cloudflare:workers";
import { elegirDesafio } from "./desafios.js";

const MAX_JUGADORES = 8;
const MIN_JUGADORES = 3;
const MAX_NOMBRE = 12;
const CANT_AVATARES = 30;
const CANT_COLORES = 8;

// La voz del Río Manso entre ronda y ronda.
const SUSURROS_CALMA = [
  "EL RÍO ESPERA, PACIENTE.",
  "POR AHORA, EL AGUA SIGUE QUIETA.",
  "NADIE ESTA VEZ... TODAVÍA.",
  "EL RÍO LOS MIRA. NO LE GUSTA PERDER.",
  "SE ESCUCHA EL AGUA RESPIRANDO.",
];
const SUSURROS_CAIDA = [
  "EL AGUA SE LLEVÓ LO SUYO.",
  "UNO MENOS PARA VER EL AMANECER.",
  "EL RÍO MANSO NUNCA DEVUELVE.",
  "¿ESCUCHAN? ES EL AGUA, LLAMANDO.",
  "LA CORRIENTE SE LO TRAGÓ SIN RUIDO.",
];
const SUSURROS_FINAL = [
  "EL AMANECER ESTÁ CERCA. EL RÍO TIENE HAMBRE.",
  "ÚLTIMOS MINUTOS. EL AGUA SUBE.",
  "TAN CERCA DE LA LUZ... NO AFLOJEN.",
];

function elegirDe(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

export class Sala extends DurableObject {
  // Con MODO_PRUEBA las fases duran segundos, para que las pruebas
  // automáticas no esperen partidas reales.
  duraciones() {
    if (this.env.MODO_PRUEBA === "1") {
      return {
        intro: 1200,
        resolucion: 1000,
        rondaBase: 2500,
        rondaMin: 1200,
        paso: 300,
        rondas: 4,
        luzEsperaMin: 500,
        luzEsperaMax: 1000,
        luzReaccion: 1500,
      };
    }
    return {
      intro: 7000,
      resolucion: 4000,
      rondaBase: 7000, // tiempo de la primera ronda
      rondaMin: 3000, // piso: por más que avance, nunca menos que esto
      paso: 550, // cuánto se acorta cada ronda
      rondas: 8, // sobrevivir estas rondas = el grupo gana
      luzEsperaMin: 1200, // luz verde: mínimo de espera antes de la señal
      luzEsperaMax: 3800, // máximo de espera
      luzReaccion: 2500, // ventana para tocar después de la señal
    };
  }

  // Tiempo de respuesta de una ronda: arranca alto y se acorta.
  rondaMs(ronda) {
    const d = this.duraciones();
    return Math.max(d.rondaMin, d.rondaBase - (ronda - 1) * d.paso);
  }

  async fetch(request) {
    const url = new URL(request.url);

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

  // Jugadores conectados, ordenados por llegada (el primero es el guía).
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
    }));
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
      case "iniciar":
        await this.manejarIniciar(ws);
        break;
      case "responder":
        await this.manejarResponder(ws, msg);
        break;
      case "ayuda":
        await this.manejarAyuda(ws, msg);
        break;
      case "revancha":
        await this.manejarRevancha(ws);
        break;
    }
  }

  // ─── Lobby e ingreso ───

  async manejarUnirse(ws, msg) {
    if (ws.deserializeAttachment()) return; // ya está unido

    if ((await this.fase()) !== "lobby") {
      return this.manejarReconexion(ws, msg);
    }

    const jugadores = this.jugadores();
    if (jugadores.length >= MAX_JUGADORES) {
      return this.rechazar(ws, "CABAÑA LLENA. CAPACIDAD MÁXIMA: 8 PERSONAS.");
    }

    const nombre = String(msg.nombre || "").trim().slice(0, MAX_NOMBRE);
    if (!nombre) {
      return this.rechazar(ws, "NECESITÁS UN NOMBRE PARA ENTRAR.");
    }
    if (jugadores.some((j) => j.nombre.toLowerCase() === nombre.toLowerCase())) {
      return this.rechazar(ws, "ESE NOMBRE YA ESTÁ EN USO EN LA CABAÑA.");
    }

    const avatar =
      Number.isInteger(msg.avatar) && msg.avatar >= 0 && msg.avatar < CANT_AVATARES
        ? msg.avatar
        : 0;
    const usados = new Set(jugadores.map((j) => j.color));
    let color = 0;
    while (usados.has(color) && color < CANT_COLORES - 1) color++;

    const orden = await this.leer("orden", 0);
    await this.ctx.storage.put("orden", orden + 1);

    const jugador = { id: crypto.randomUUID(), nombre, avatar, color, orden };
    ws.serializeAttachment(jugador);

    this.enviar(ws, { tipo: "bienvenida", tuId: jugador.id });
    await this.difundirLobby();
  }

  // Reconexión: mismo código + mismo nombre recupera el puesto, y se
  // entera de si sigue vivo o ya es un fantasma.
  async manejarReconexion(ws, msg) {
    const fase = await this.fase();
    const plantel = await this.leer("plantel", null);
    const nombre = String(msg.nombre || "").trim().toLowerCase();

    if (!plantel || fase === "final") {
      return this.rechazar(ws, "HAY UNA PARTIDA EN CURSO. ESPERÁ A QUE TERMINE.");
    }

    const conectados = new Set(this.jugadores().map((j) => j.id));
    const entrada = Object.values(plantel).find(
      (j) => j.nombre.toLowerCase() === nombre && !conectados.has(j.id)
    );
    if (!entrada) {
      return this.rechazar(
        ws,
        "PARTIDA EN CURSO. SOLO PUEDE VOLVER QUIEN SE DESCONECTÓ, CON SU MISMO NOMBRE."
      );
    }

    ws.serializeAttachment(entrada);

    const vivos = await this.leer("vivos", []);
    const desafio = await this.leer("desafio", null);
    const respuestas = await this.leer("respuestas", {});
    const finFase = await this.leer("finFase", Date.now());

    this.enviar(ws, { tipo: "bienvenida", tuId: entrada.id });
    this.enviar(ws, {
      tipo: "reconexion",
      fase,
      ronda: await this.leer("ronda", 0),
      total: this.duraciones().rondas,
      jugadores: Object.values(plantel).map((j) => ({
        id: j.id, nombre: j.nombre, avatar: j.avatar,
      })),
      vivos,
      soyVivo: vivos.includes(entrada.id),
      yaRespondi: respuestas[entrada.id] != null,
      tengoAyuda:
        !vivos.includes(entrada.id) &&
        !(await this.leer("ayudasUsadas", [])).includes(entrada.id),
      yaVerde: desafio?.datos?.tipo === "luzverde"
        ? Date.now() >= (await this.leer("greenAt", 0))
        : false,
      desafio: fase === "ronda" && desafio
        ? { tipo: desafio.tipo, enunciado: desafio.enunciado, datos: desafio.datos }
        : null,
      restanteMs: Math.max(0, finFase - Date.now()),
    });

    this.difundir({ tipo: "presencia", jugadorId: entrada.id, conectado: true }, ws);
  }

  async manejarIniciar(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "lobby") return;

    const jugadores = this.jugadores();
    if (jugadores[0].id !== yo.id) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: "SOLO QUIEN ABRIÓ LA CABAÑA PUEDE EMPEZAR.",
      });
    }
    if (jugadores.length < MIN_JUGADORES) {
      return this.enviar(ws, {
        tipo: "error",
        mensaje: `SE NECESITAN ${MIN_JUGADORES} PERSONAS COMO MÍNIMO.`,
      });
    }

    // El plantel queda registrado para permitir reconexiones.
    const plantel = {};
    for (const j of jugadores) {
      plantel[j.id] = { id: j.id, nombre: j.nombre, avatar: j.avatar, color: j.color, orden: j.orden };
    }

    const finFase = Date.now() + this.duraciones().intro;
    await this.ctx.storage.put({
      plantel,
      vivos: jugadores.map((j) => j.id),
      ronda: 0,
      finFase,
      desafio: null,
      respuestas: {},
    });
    await this.cambiarFase("intro");
    await this.ctx.storage.setAlarm(finFase);

    this.difundir({
      tipo: "faseCambio",
      fase: "intro",
      jugadores: this.fichas(),
      restanteMs: this.duraciones().intro,
      texto: [
        "LLEGARON A LA CABAÑA AL CAER LA NOCHE.",
        "EL RÍO MANSO CORRE DETRÁS, QUIETO. DEMASIADO QUIETO.",
        "EL VIEJO APARATO DE LA REPISA SE ENCIENDE SOLO...",
        "SOBREVIVAN A SUS PRUEBAS. QUE AL MENOS UNO LLEGUE AL AMANECER.",
      ],
    });
  }

  // ─── El bucle de rondas ───

  async iniciarRonda() {
    const total = this.duraciones().rondas;
    const ronda = (await this.leer("ronda", 0)) + 1;
    const desafio = elegirDesafio(
      ronda,
      this.env.SOLO_DESAFIO || this.env.MODO_PRUEBA === "1"
    );
    const ahora = Date.now();

    // "Luz verde" tiene su propio ritmo: una espera al azar (la señal)
    // y después una ventana para reaccionar. El momento de la luz se
    // guarda en el servidor y NUNCA viaja al cliente.
    let duracion, greenAt = 0;
    if (desafio.tipo === "luzverde") {
      const d = this.duraciones();
      const espera = d.luzEsperaMin + Math.floor(Math.random() * (d.luzEsperaMax - d.luzEsperaMin));
      greenAt = ahora + espera;
      duracion = espera + d.luzReaccion;
    } else {
      duracion = this.rondaMs(ronda);
    }
    const finFase = ahora + duracion;

    await this.ctx.storage.put({
      ronda,
      desafio, // incluye la respuesta correcta (secreta)
      respuestas: {},
      escudos: [], // protecciones de fantasmas para esta ronda
      finFase,
      greenAt,
    });
    await this.cambiarFase("ronda");
    await this.ctx.storage.setAlarm(finFase);

    const vivos = await this.leer("vivos", []);
    this.difundir({
      tipo: "desafio",
      ronda,
      total,
      tipoDesafio: desafio.tipo,
      enunciado: desafio.enunciado,
      datos: desafio.datos, // sin la respuesta correcta ni el greenAt
      vivos,
      restanteMs: duracion,
    });

    // La señal de luz verde se dispara a todos en el momento exacto.
    if (desafio.tipo === "luzverde") {
      if (this._luzTimer) clearTimeout(this._luzTimer);
      this._luzTimer = setTimeout(() => {
        this.difundir({ tipo: "luzverde" });
      }, Math.max(0, greenAt - Date.now()));
    }
  }

  async manejarResponder(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "ronda") return;

    const vivos = await this.leer("vivos", []);
    if (!vivos.includes(yo.id)) return; // los fantasmas miran, no juegan

    const respuestas = await this.leer("respuestas", {});
    if (respuestas[yo.id] != null) return; // una sola respuesta por ronda

    respuestas[yo.id] = { valor: String(msg.valor ?? ""), t: Date.now() };
    await this.ctx.storage.put("respuestas", respuestas);

    this.enviar(ws, { tipo: "respuestaRecibida" });
    const respondieron = vivos.filter((id) => respuestas[id] != null).length;
    this.difundir({ tipo: "progreso", respondieron, totalVivos: vivos.length });

    // Si todos los vivos contestaron, no hay que esperar al reloj.
    if (respondieron >= vivos.length) {
      await this.resolverRonda();
    }
  }

  // Un fantasma (eliminado) gasta su única ayuda sobre un vivo:
  // una PISTA (le tacha opciones malas) o un ESCUDO (lo salva si falla).
  socketDe(id) {
    for (const s of this.ctx.getWebSockets()) {
      if (s.deserializeAttachment()?.id === id) return s;
    }
    return null;
  }

  async manejarAyuda(ws, msg) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "ronda") return;

    const vivos = await this.leer("vivos", []);
    if (vivos.includes(yo.id)) return; // los vivos juegan, no dan ayudas
    const plantel = await this.leer("plantel", {});
    if (!plantel[yo.id]) return; // debe ser del plantel (un fantasma)

    const usadas = await this.leer("ayudasUsadas", []);
    if (usadas.includes(yo.id)) return; // una sola ayuda por fantasma

    const objetivoId = String(msg.objetivoId || "");
    if (!vivos.includes(objetivoId)) return; // solo a alguien vivo
    if (msg.accion !== "pista" && msg.accion !== "escudo") return;

    usadas.push(yo.id);
    await this.ctx.storage.put("ayudasUsadas", usadas);
    const objetivo = this.socketDe(objetivoId);

    if (msg.accion === "pista") {
      const desafio = await this.leer("desafio", null);
      const ids = desafio.datos.opciones.map((o) => o.id);
      const malas = ids.filter((id) => id !== desafio.correcta);
      for (let i = malas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [malas[i], malas[j]] = [malas[j], malas[i]];
      }
      const dejarMalas = ids.length >= 6 ? 2 : 1;
      const visibles = [desafio.correcta, ...malas.slice(0, dejarMalas)];
      if (objetivo) this.enviar(objetivo, { tipo: "pista", visibles, de: yo.nombre });
    } else {
      const escudos = await this.leer("escudos", []);
      if (!escudos.includes(objetivoId)) {
        escudos.push(objetivoId);
        await this.ctx.storage.put("escudos", escudos);
      }
      if (objetivo) this.enviar(objetivo, { tipo: "escudo", de: yo.nombre });
    }

    this.enviar(ws, {
      tipo: "ayudaConfirmada",
      accion: msg.accion,
      objetivo: plantel[objetivoId]?.nombre || "???",
    });
  }

  async resolverRonda() {
    if ((await this.fase()) !== "ronda") return;

    const desafio = await this.leer("desafio", null);
    const respuestas = await this.leer("respuestas", {});
    const vivos = await this.leer("vivos", []);
    const plantel = await this.leer("plantel", {});
    const escudos = await this.leer("escudos", []);
    const greenAt = await this.leer("greenAt", 0);
    const esReflejo = desafio.datos?.tipo === "luzverde";

    const sobreviven = [];
    const desaparecidos = [];
    const resultados = [];
    for (const id of vivos) {
      const r = respuestas[id];
      // Luz verde: acierta quien tocó DESPUÉS de la señal (no antes).
      // Resto: acierta quien eligió la opción correcta.
      const acerto = esReflejo
        ? r != null && r.t >= greenAt
        : r != null && r.valor === desafio.correcta;
      // Si falló pero tenía escudo de un fantasma, resiste.
      const escudado = !acerto && escudos.includes(id);
      resultados.push({ id, ok: acerto, respondio: r != null, escudado });
      if (acerto || escudado) sobreviven.push(id);
      else desaparecidos.push(id);
    }

    const duracion = this.duraciones().resolucion;
    const finFase = Date.now() + duracion;
    await this.ctx.storage.put({ vivos: sobreviven, finFase });
    await this.cambiarFase("resolucion");
    await this.ctx.storage.setAlarm(finFase);

    // La voz del Río reacciona: si se llevó a alguien, o si falta poco.
    const rondaActual = await this.leer("ronda", 0);
    const total = this.duraciones().rondas;
    let susurro;
    if (desaparecidos.length > 0) susurro = elegirDe(SUSURROS_CAIDA);
    else if (total - rondaActual <= 2 && sobreviven.length > 0) susurro = elegirDe(SUSURROS_FINAL);
    else susurro = elegirDe(SUSURROS_CALMA);

    this.difundir({
      tipo: "resolucion",
      correcta: desafio.correcta,
      resultados,
      desaparecidos: desaparecidos.map((id) => ({
        id, nombre: plantel[id]?.nombre || "???",
      })),
      vivos: sobreviven,
      ronda: rondaActual,
      total,
      susurro,
      restanteMs: duracion,
    });
  }

  // Tras mostrar el resultado: ¿siguen, ganaron o perdieron?
  async avanzar() {
    if ((await this.fase()) !== "resolucion") return;
    const vivos = await this.leer("vivos", []);
    const ronda = await this.leer("ronda", 0);
    const total = this.duraciones().rondas;

    if (vivos.length === 0) {
      await this.finalizar(false);
    } else if (ronda >= total) {
      await this.finalizar(true);
    } else {
      await this.iniciarRonda();
    }
  }

  async alarm() {
    const fase = await this.fase();
    if (fase === "intro") await this.iniciarRonda();
    else if (fase === "ronda") await this.resolverRonda();
    else if (fase === "resolucion") await this.avanzar();
  }

  // ─── Final y revancha ───

  async finalizar(ganaron) {
    await this.cambiarFase("final");
    await this.ctx.storage.deleteAlarm();
    const vivos = await this.leer("vivos", []);
    const plantel = await this.leer("plantel", {});

    this.difundir({
      tipo: "faseCambio",
      fase: "final",
      resultado: {
        ganaron,
        ronda: await this.leer("ronda", 0),
        total: this.duraciones().rondas,
        sobrevivientes: vivos.map((id) => ({
          id, nombre: plantel[id]?.nombre || "???", avatar: plantel[id]?.avatar || 0,
        })),
      },
    });
  }

  async manejarRevancha(ws) {
    const yo = ws.deserializeAttachment();
    if (!yo) return;
    if ((await this.fase()) !== "final") return;

    await this.ctx.storage.delete([
      "plantel", "vivos", "ronda", "desafio", "respuestas", "finFase",
      "escudos", "ayudasUsadas", "greenAt",
    ]);
    await this.cambiarFase("lobby");

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
    if (restantes.length === 0) {
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this._fase = undefined;
      return;
    }

    const fase = await this.fase();
    const yo = ws.deserializeAttachment();
    if (fase === "lobby") {
      await this.difundirLobby(ws);
      return;
    }
    if (yo) {
      this.difundir({ tipo: "presencia", jugadorId: yo.id, conectado: false }, ws);
      // Si era un vivo que faltaba responder y ya respondieron todos
      // los demás vivos conectados, se resuelve sin esperar al reloj.
      if (fase === "ronda") {
        const vivos = await this.leer("vivos", []);
        const respuestas = await this.leer("respuestas", {});
        const vivosConectados = this.jugadores(ws)
          .map((j) => j.id)
          .filter((id) => vivos.includes(id));
        const faltan = vivosConectados.filter((id) => respuestas[id] == null);
        if (vivos.length > 0 && faltan.length === 0) {
          await this.resolverRonda();
        }
      }
    }
  }

  // ─── Difusión ───

  async difundirLobby(excluir = null) {
    const jugadores = this.jugadores(excluir);
    this.difundir({
      tipo: "lobby",
      creadorId: jugadores.length ? jugadores[0].id : null,
      minimo: MIN_JUGADORES,
      jugadores: jugadores.map((j) => ({ id: j.id, nombre: j.nombre, avatar: j.avatar })),
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
