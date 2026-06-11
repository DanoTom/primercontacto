// Prueba de la Etapa 4: acciones de riesgo (botón EMERGENCIA).
// Requiere el servidor en modo prueba: npm run dev:prueba
// (interferencia 1,5 s — transmisión: umbral 3 s, costo 2 s — reinicio: +3 s)
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
const faseDe = (c, fase) => todos(c, "faseCambio").find((m) => m.fase === fase);

async function partidaLista(nombres) {
  const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
  const { codigo } = await r.json();
  const clientes = [];
  for (const n of nombres) {
    clientes.push(clienteNuevo(codigo, n));
    await espera(120);
  }
  await espera(300);
  clientes[0].enviar({ tipo: "iniciar" });
  await espera(300);
  clientes.forEach((c) => c.enviar({ tipo: "entendido" }));
  await espera(400);
  return clientes;
}

// ════════ PARTIDA 1: interferencia, transmisión y reinicio ════════
console.log("— INTERFERENCIA MANUAL (Metamorfo) —");
const clientes = await partidaLista(["Ana", "Beto", "Cami", "Dani"]);
const metamorfo = clientes.find((c) => c.rol === "metamorfo");
const contactado = clientes.find((c) => c.rol === "contactado");
const [inv1, inv2] = clientes.filter((c) => c.rol === "investigador");

metamorfo.enviar({ tipo: "emergencia" });
await espera(300);
ok(ultimo(inv1, "glitch")?.jugadorId === metamorfo.tuId,
   "todos ven el glitch en el avatar del metamorfo");
ok(ultimo(contactado, "interferencia")?.duracionMs > 0,
   "el contactado recibe el aviso privado de interferencia");
ok(!todos(inv1, "interferencia").length,
   "los investigadores NO reciben el aviso de interferencia");
ok(ultimo(metamorfo, "emergenciaConfirmada")?.accion === "interferencia",
   "el metamorfo recibe la confirmación");

contactado.enviar({ tipo: "respuesta", valor: "si" });
await espera(300);
ok(!todos(inv1, "sistema").some((m) => m.texto.includes("RESPONDE")),
   "con interferencia activa, la respuesta del contactado NO sale");

await espera(1300); // la interferencia (1,5 s) expira
contactado.enviar({ tipo: "respuesta", valor: "no" });
await espera(300);
ok(ultimo(inv1, "sistema")?.texto === "EL CONTACTADO RESPONDE: NO",
   "pasada la interferencia, los botones vuelven a funcionar");

metamorfo.enviar({ tipo: "emergencia" });
await espera(300);
ok(ultimo(metamorfo, "error")?.mensaje.includes("AGOTADA"),
   "la interferencia es de un solo uso");

console.log("— TRANSMISIÓN DE EMERGENCIA (Contactado) —");
const relojesAntes = todos(inv1, "reloj").length;
contactado.enviar({ tipo: "emergencia" });
await espera(300);
const sistemaLetra = ultimo(inv1, "sistema");
ok(sistemaLetra?.texto.includes("COMIENZA CON"),
   "la primera letra llega como mensaje del sistema");
ok(sistemaLetra?.texto.includes(`«${contactado.palabra[0].toUpperCase()}»`),
   "la letra transmitida es la correcta");
ok(todos(inv1, "reloj").length > relojesAntes,
   "el reloj se re-sincroniza tras el costo de tiempo");
contactado.enviar({ tipo: "emergencia" });
await espera(300);
ok(ultimo(contactado, "error")?.mensaje.includes("AGOTADA"),
   "la transmisión es de un solo uso");

console.log("— REINICIO DE SISTEMA (Investigadores) —");
inv1.enviar({ tipo: "emergencia" });
await espera(300);
ok(ultimo(inv1, "reinicioEstado")?.presionados === 1
   && ultimo(inv1, "reinicioEstado")?.total === 2,
   "el indicador muestra 1/2 tras el primer botón");
ok(ultimo(inv2, "reinicioEstado")?.presionados === 1,
   "el otro investigador también ve el indicador");
ok(!todos(metamorfo, "reinicioEstado").length,
   "el metamorfo NO ve el indicador de reinicio");

inv1.enviar({ tipo: "emergencia" });
await espera(300);
ok(ultimo(inv2, "reinicioEstado")?.presionados === 1,
   "repetir el botón no suma dos veces");

const palabraVieja = contactado.palabra;
inv2.enviar({ tipo: "emergencia" });
await espera(400);
ok(ultimo(inv1, "sistema")?.texto.includes("REINICIO DE SISTEMA"),
   "con todos los investigadores, el reinicio se ejecuta");
const nuevaContactado = ultimo(contactado, "palabraNueva")?.palabra;
const nuevaMetamorfo = ultimo(metamorfo, "palabraNueva")?.palabra;
ok(typeof nuevaContactado === "string" && nuevaContactado !== palabraVieja,
   "el contactado recibe la palabra nueva (distinta de la vieja)");
ok(nuevaMetamorfo === nuevaContactado, "el metamorfo recibe la misma palabra nueva");
ok(!todos(inv1, "palabraNueva").length, "los investigadores NO reciben la palabra nueva");

// La palabra nueva es la que vale: escribirla gana la partida.
inv1.enviar({ tipo: "enviar", texto: `¿será ${nuevaContactado}?` });
await espera(400);
const final = faseDe(inv2, "final");
ok(final?.resultado.ganador === "humanos" && final?.resultado.palabra === nuevaContactado,
   "escribir la palabra NUEVA gana la partida (la vieja ya no rige)");

clientes.forEach((c) => c.ws.close());
await espera(300);

// ════════ PARTIDA 2: transmisión con la señal casi agotada ════════
console.log("— TRANSMISIÓN BLOQUEADA POR SEÑAL DÉBIL —");
{
  const cls = await partidaLista(["Eli", "Fede", "Gima", "Hugo"]);
  const cont = cls.find((c) => c.rol === "contactado");
  // La partida de prueba dura 8 s; esperamos a que queden menos de 3 s.
  await espera(5600);
  cont.enviar({ tipo: "emergencia" });
  await espera(300);
  ok(ultimo(cont, "error")?.mensaje.includes("DÉBIL"),
     "con menos del umbral restante, la transmisión se rechaza");
  cls.forEach((c) => c.ws.close());
  await espera(300);
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
