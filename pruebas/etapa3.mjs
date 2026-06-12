// Prueba de la Etapa 3: roles, palabra, reloj, juicio y resultado.
// Requiere el servidor en modo prueba: npm run dev:prueba
// (fases cortas: revelación 2.5 s, partida 8 s, juicio 3 s)
const BASE = "http://localhost:8787";
const WS = "ws://localhost:8787";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;

function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

function clienteNuevo(codigo, nombre, avatar = 0) {
  const ws = new WebSocket(`${WS}/api/sala/${codigo}/ws`);
  const c = { ws, nombre, mensajes: [], tuId: null, rol: null, palabra: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
    if (m.tipo === "rol") {
      c.rol = m.rol;
      c.palabra = m.palabra;
    }
  };
  c.enviar = (obj) => c.ws.send(JSON.stringify(obj));
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);
const todos = (c, tipo) => c.mensajes.filter((m) => m.tipo === tipo);
const faseDe = (c, fase) =>
  todos(c, "faseCambio").find((m) => m.fase === fase);

async function armarPartida(nombres) {
  const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
  const { codigo } = await r.json();
  const clientes = [];
  for (const n of nombres) {
    clientes.push(clienteNuevo(codigo, n));
    await espera(150);
  }
  await espera(400);
  return { codigo, clientes };
}

function normalizar(t) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ════════ ESCENARIO A: roles, contactado, victoria por descifrado ════════
console.log("— ESCENARIO A: revelación y victoria por descifrado —");
{
  const { clientes } = await armarPartida(["Ana", "Beto", "Cami", "Dani"]);
  const [ana] = clientes;

  // Dificultad: solo el creador puede cambiarla.
  clientes[1].enviar({ tipo: "dificultad", valor: "dificil" });
  await espera(300);
  ok(ultimo(ana, "lobby")?.dificultad === "media", "un no-creador no cambia la dificultad");
  ana.enviar({ tipo: "dificultad", valor: "facil" });
  await espera(300);
  ok(ultimo(clientes[2], "lobby")?.dificultad === "facil", "el creador cambia la dificultad y todos la ven");

  ana.enviar({ tipo: "iniciar" });
  await espera(500);

  const roles = clientes.map((c) => c.rol);
  ok(roles.filter((r) => r === "contactado").length === 1, "hay exactamente 1 contactado");
  ok(roles.filter((r) => r === "metamorfo").length === 1, "hay exactamente 1 metamorfo");
  ok(roles.filter((r) => r === "investigador").length === 2, "hay 2 investigadores");

  const contactado = clientes.find((c) => c.rol === "contactado");
  const metamorfo = clientes.find((c) => c.rol === "metamorfo");
  const investigadores = clientes.filter((c) => c.rol === "investigador");

  ok(typeof contactado.palabra === "string", "el contactado conoce la palabra");
  ok(metamorfo.palabra === contactado.palabra, "el metamorfo conoce la misma palabra");
  ok(investigadores.every((c) => c.palabra === undefined), "los investigadores NO reciben la palabra");
  ok(ultimo(contactado, "rol").contactadoId === contactado.tuId, "el contactadoId es correcto");

  // Confirmaciones: todos ENTENDIDO → la partida arranca antes del timeout.
  clientes.forEach((c) => c.enviar({ tipo: "entendido" }));
  await espera(500);
  const fp = faseDe(investigadores[0], "partida");
  ok(!!fp, "todos confirmaron y la partida arrancó");
  ok(fp.restanteMs > 0, `la partida llega con reloj (${fp.restanteMs} ms)`);

  // El contactado responde con botón; su teclado está muerto.
  contactado.enviar({ tipo: "respuesta", valor: "si" });
  await espera(300);
  ok(
    ultimo(investigadores[1], "sistema")?.texto === "EL CONTACTADO RESPONDE: SÍ",
    "la respuesta del contactado llega como mensaje del sistema"
  );
  contactado.enviar({ tipo: "respuesta", valor: "no" });
  await espera(300);
  ok(
    todos(investigadores[1], "sistema").length === 1,
    "el anti-spam frena respuestas pegadas (pausa de 1,5 s)"
  );
  contactado.enviar({ tipo: "enviar", texto: "hola soy el contactado" });
  contactado.enviar({ tipo: "tecleo", texto: "tecleando" });
  await espera(300);
  ok(todos(investigadores[0], "mensaje").length === 0, "el contactado no puede enviar mensajes");
  ok(todos(investigadores[0], "tecleo").length === 0, "el contactado no puede teclear");

  // Votar durante la partida no hace nada.
  investigadores[0].enviar({ tipo: "votar", objetivoId: metamorfo.tuId });
  await espera(300);
  ok(!faseDe(ana, "final"), "votar fuera del juicio se ignora");

  // La respuesta citada: el contactado responde A una pregunta concreta.
  await espera(700); // deja pasar el anti-spam
  investigadores[0].enviar({ tipo: "enviar", texto: "¿vuela de noche?" });
  await espera(300);
  const pregunta = ultimo(investigadores[1], "mensaje");
  ok(typeof pregunta?.id === "number", "los mensajes llevan número de cita");
  contactado.enviar({ tipo: "respuesta", valor: "inestable", refId: pregunta.id });
  await espera(300);
  const citada = ultimo(investigadores[1], "sistema");
  ok(
    citada?.texto.includes("«¿vuela de noche?»") &&
    citada?.texto.includes(investigadores[0].nombre.toUpperCase()) &&
    citada?.texto.includes("SEÑAL INESTABLE"),
    "la respuesta cita la pregunta y a su autor"
  );

  // El metamorfo comete el error fatal: escribe la palabra
  // (en mayúsculas y sin tildes, para probar la normalización).
  const delatada = normalizar(contactado.palabra).toUpperCase();
  metamorfo.enviar({ tipo: "enviar", texto: `no creo que sea ${delatada} jaja` });
  await espera(500);

  const final = faseDe(investigadores[0], "final");
  ok(!!final, "la partida terminó al aparecer la palabra");
  ok(final?.resultado.ganador === "humanos", "ganan los humanos");
  ok(final?.resultado.motivo === "descifrado", "motivo: descifrado");
  ok(final?.resultado.palabra === contactado.palabra, "se revela la palabra original");
  ok(final?.resultado.metamorfoId === metamorfo.tuId, "se revela al metamorfo");

  // Revancha: todos vuelven al lobby de la misma sala.
  ana.enviar({ tipo: "revancha" });
  await espera(400);
  const lobbyNuevo = ultimo(clientes[3], "lobby");
  ok(faseDe(clientes[3], "lobby") && lobbyNuevo?.jugadores.length === 4,
     "revancha: los 4 vuelven al lobby de la misma sala");

  clientes.forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ ESCENARIO B: juicio con voto unánime al metamorfo ════════
console.log("— ESCENARIO B: el reloj se agota y la votación condena al metamorfo —");
{
  const { clientes } = await armarPartida(["Eli", "Fede", "Gima", "Hugo"]);
  clientes[0].enviar({ tipo: "iniciar" });
  await espera(400);
  clientes.forEach((c) => c.enviar({ tipo: "entendido" }));
  await espera(500);

  const metamorfo = clientes.find((c) => c.rol === "metamorfo");
  const contactado = clientes.find((c) => c.rol === "contactado");

  // Esperar a que el reloj de partida (8 s en modo prueba) se agote.
  await espera(8500);
  const juicio = faseDe(clientes[1], "juicio");
  ok(!!juicio, "al agotarse el reloj empieza el Juicio Final");
  ok(juicio?.restanteMs > 0, "el juicio llega con su propio reloj");

  // La terminal queda bloqueada.
  clientes[1].enviar({ tipo: "enviar", texto: "tarde" });
  await espera(300);
  ok(
    !todos(clientes[2], "mensaje").some((m) => m.texto === "tarde"),
    "la terminal está bloqueada durante el juicio"
  );

  // No se puede votar al contactado.
  clientes.find((c) => c.rol === "investigador").enviar({
    tipo: "votar",
    objetivoId: contactado.tuId,
  });
  await espera(300);
  const errVoto = ultimo(clientes.find((c) => c.rol === "investigador"), "error");
  ok(errVoto?.mensaje.includes("CONTACTADO"), "no se puede votar al contactado");

  // Todos votan al metamorfo → resolución anticipada.
  clientes.forEach((c) => c.enviar({ tipo: "votar", objetivoId: metamorfo.tuId }));
  await espera(500);
  const final = faseDe(clientes[0], "final");
  ok(!!final, "con todos los votos, el juicio se resuelve sin esperar");
  ok(final?.resultado.ganador === "humanos", "el más votado era el metamorfo: ganan los humanos");
  ok(final?.resultado.motivo === "votacion", "motivo: votación");
  const recuento = final?.resultado.recuento || [];
  ok(
    recuento[0]?.id === metamorfo.tuId && recuento[0]?.votos === 4,
    "el recuento muestra 4 votos al metamorfo"
  );

  clientes.forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ ESCENARIO C: timeout de revelación, votos errados, gana el metamorfo ════════
console.log("— ESCENARIO C: el pueblo se equivoca y gana el metamorfo —");
{
  const { clientes } = await armarPartida(["Ines", "Juan", "Kati", "Leo"]);
  clientes[0].enviar({ tipo: "iniciar" });
  await espera(400);

  // Solo 3 confirman: la partida igual arranca por timeout (2,5 s).
  clientes.slice(0, 3).forEach((c) => c.enviar({ tipo: "entendido" }));
  await espera(3000);
  ok(!!faseDe(clientes[3], "partida"), "sin todas las confirmaciones, arranca por timeout");

  await espera(8500); // se agota la partida
  ok(!!faseDe(clientes[0], "juicio"), "empieza el juicio");

  // Dos votan a un inocente, uno al metamorfo, uno se abstiene.
  const metamorfo = clientes.find((c) => c.rol === "metamorfo");
  const inocente = clientes.find((c) => c.rol === "investigador");
  const votantes = clientes.filter((c) => c !== inocente);
  votantes[0].enviar({ tipo: "votar", objetivoId: inocente.tuId });
  votantes[1].enviar({ tipo: "votar", objetivoId: inocente.tuId });
  votantes[2].enviar({ tipo: "votar", objetivoId: metamorfo.tuId });
  // el cuarto (inocente) se abstiene → resuelve la alarma (3 s)

  await espera(3700);
  const final = faseDe(clientes[1], "final");
  ok(!!final, "el juicio se resuelve por timeout con abstención");
  ok(final?.resultado.ganador === "metamorfo", "el más votado era inocente: gana el metamorfo");

  clientes.forEach((c) => c.ws.close());
  await espera(300);
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
