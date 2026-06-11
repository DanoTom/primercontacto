// Prueba de la Etapa 6: reconexiones, anulación y estrés con 8.
// Requiere el servidor en modo prueba: npm run dev:prueba
// (partida 8 s — anulación a los 2 s del rol clave caído)
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
    if (m.tipo === "rol" || m.tipo === "reconexion") {
      c.rol = m.rol;
      if (m.palabra !== undefined) c.palabra = m.palabra;
    }
  };
  c.enviar = (obj) => c.ws.send(JSON.stringify(obj));
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);
const todos = (c, tipo) => c.mensajes.filter((m) => m.tipo === tipo);
const faseDe = (c, fase) => todos(c, "faseCambio").find((m) => m.fase === fase);

async function partidaLista(nombres) {
  const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
  const { codigo } = await r.json();
  const clientes = [];
  for (const n of nombres) {
    clientes.push(clienteNuevo(codigo, n));
    await espera(100);
  }
  await espera(300);
  clientes[0].enviar({ tipo: "iniciar" });
  await espera(300);
  clientes.forEach((c) => c.enviar({ tipo: "entendido" }));
  await espera(400);
  return { codigo, clientes };
}

// ════════ A: reconexión de un investigador ════════
console.log("— A: UN INVESTIGADOR SE CAE Y VUELVE —");
{
  const { codigo, clientes } = await partidaLista(["Ana", "Beto", "Cami", "Dani"]);
  const caido = clientes.find((c) => c.rol === "investigador");
  const testigo = clientes.find((c) => c !== caido);
  const idCaido = caido.tuId;

  caido.ws.close();
  await espera(400);
  const presencia = ultimo(testigo, "presencia");
  ok(presencia?.jugadorId === idCaido && presencia?.conectado === false,
     "los demás ven la polaroid caída (presencia: desconectado)");

  // Mientras está caído, la partida sigue.
  const emisor = clientes.find((c) => c !== caido && c.rol !== "contactado");
  emisor.enviar({ tipo: "enviar", texto: "¿sigue ahí la señal?" });
  await espera(300);

  // Vuelve con el mismo nombre.
  const vuelto = clienteNuevo(codigo, caido.nombre);
  await espera(500);
  ok(vuelto.tuId === idCaido, "recupera su misma identidad (mismo id)");
  const rec = ultimo(vuelto, "reconexion");
  ok(rec?.fase === "partida" && rec?.rol === "investigador",
     "recibe fase y rol correctos al volver");
  ok(rec?.palabra === undefined, "sigue sin conocer la palabra (es investigador)");
  ok(rec?.historial?.some((l) => l.texto === "¿sigue ahí la señal?"),
     "recibe el historial que se perdió mientras estaba caído");
  ok(ultimo(testigo, "presencia")?.conectado === true,
     "los demás ven la polaroid levantarse (presencia: conectado)");

  // Un intruso con nombre nuevo no puede colarse.
  const intruso = clienteNuevo(codigo, "Intruso");
  await espera(400);
  ok(ultimo(intruso, "error")?.mensaje.includes("EN CURSO"),
     "un nombre desconocido no puede entrar a la partida en curso");

  // Nadie puede duplicar a un operador conectado.
  const doble = clienteNuevo(codigo, emisor.nombre);
  await espera(400);
  ok(ultimo(doble, "error")?.mensaje.includes("OPERADOR"),
     "no se puede suplantar a un operador que sigue conectado");

  [...clientes.filter((c) => c !== caido), vuelto].forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ B: el Contactado se cae y no vuelve → SEÑAL PERDIDA ════════
console.log("— B: EL CONTACTADO ABANDONA Y LA PARTIDA SE ANULA —");
{
  const { clientes } = await partidaLista(["Eli", "Fede", "Gima", "Hugo"]);
  const contactado = clientes.find((c) => c.rol === "contactado");
  contactado.ws.close();

  await espera(2700); // anulación de prueba: 2 s
  const resto = clientes.filter((c) => c !== contactado);
  const anulacion = resto.map((c) =>
    todos(c, "faseCambio").find((m) => m.fase === "lobby" && m.aviso)
  );
  ok(anulacion.every((m) => m?.aviso.includes("SEÑAL PERDIDA")),
     "todos reciben SEÑAL PERDIDA y vuelven al lobby");
  const lobby = ultimo(resto[0], "lobby");
  ok(lobby?.jugadores.length === 3, "el lobby queda con los 3 que siguen");

  resto.forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ C: el Metamorfo se cae pero vuelve a tiempo ════════
console.log("— C: EL METAMORFO VUELVE ANTES DEL LÍMITE —");
{
  const { codigo, clientes } = await partidaLista(["Iris", "Juan", "Kati", "Leo"]);
  const metamorfo = clientes.find((c) => c.rol === "metamorfo");
  const palabraOriginal = metamorfo.palabra;
  metamorfo.ws.close();
  await espera(700);

  const vuelto = clienteNuevo(codigo, metamorfo.nombre);
  await espera(500);
  ok(ultimo(vuelto, "reconexion")?.rol === "metamorfo",
     "el metamorfo recupera su rol");
  ok(vuelto.palabra === palabraOriginal,
     "y recupera la palabra secreta");

  await espera(2300); // ya pasó el plazo de anulación: no debe dispararse
  const resto = clientes.filter((c) => c !== metamorfo);
  ok(!resto.some((c) => todos(c, "faseCambio").some((m) => m.fase === "lobby")),
     "la partida NO se anula si vuelve a tiempo");

  [...resto, vuelto].forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ D: estrés con 8 jugadores tecleando a la vez ════════
console.log("— D: 8 JUGADORES, TECLEO SIMULTÁNEO Y FINAL LIMPIO —");
{
  const nombres = ["N1", "N2", "N3", "N4", "N5", "N6", "N7", "N8"];
  const { clientes } = await partidaLista(nombres);
  const contactado = clientes.find((c) => c.rol === "contactado");
  const metamorfo = clientes.find((c) => c.rol === "metamorfo");
  const tecleadores = clientes.filter((c) => c.rol !== "contactado");

  // 2,5 segundos de ráfagas: 7 jugadores envían borradores cada 100 ms.
  for (let tic = 0; tic < 25; tic++) {
    tecleadores.forEach((c, i) =>
      c.enviar({ tipo: "tecleo", texto: `borrador-${i}-${tic}` })
    );
    await espera(100);
  }
  // Cada uno envía un mensaje final.
  tecleadores.forEach((c, i) => c.enviar({ tipo: "enviar", texto: `pregunta ${i}` }));
  await espera(600);

  const observador = contactado;
  const mensajes = todos(observador, "mensaje").map((m) => m.texto);
  ok(tecleadores.every((c, i) => mensajes.includes(`pregunta ${i}`)),
     "los 7 mensajes llegan completos tras la ráfaga");

  const ultimosTecleos = tecleadores.map((c) => {
    const t = todos(observador, "tecleo").filter((m) => m.jugadorId === c.tuId);
    return t[t.length - 1];
  });
  ok(ultimosTecleos.every((t, i) => t && t.texto.startsWith(`borrador-${i}-`)),
     "el último borrador de cada jugador llegó bien atribuido");
  ok(!clientes.some((c) => todos(c, "error").length > 0),
     "ningún cliente recibió errores durante el estrés");

  // El metamorfo escribe la palabra: el final sigue funcionando bajo carga.
  metamorfo.enviar({ tipo: "enviar", texto: `será ${metamorfo.palabra}` });
  await espera(500);
  ok(faseDe(clientes[2], "final")?.resultado.ganador === "humanos",
     "la victoria por descifrado funciona tras el estrés");

  clientes.forEach((c) => c.ws.close());
  await espera(300);
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
