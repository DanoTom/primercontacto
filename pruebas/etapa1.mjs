// Prueba de la Etapa 1: simula el flujo completo del lobby.
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
  const c = { ws, nombre, mensajes: [], tuId: null, abierto: false };
  ws.onopen = () => {
    c.abierto = true;
    ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar }));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
  };
  ws.onclose = () => { c.abierto = false; };
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);

// 1. Crear sala
const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
const { codigo } = await r.json();
ok(/^[A-Z]{4}$/.test(codigo), `crear sala devuelve código de 4 letras (${codigo})`);

// 2. Se unen 3 jugadores
const ana = clienteNuevo(codigo, "Ana");
await espera(400);
const beto = clienteNuevo(codigo, "Beto", 2);
const cami = clienteNuevo(codigo, "Cami", 3);
await espera(600);

let lobbyAna = ultimo(ana, "lobby");
ok(lobbyAna && lobbyAna.jugadores.length === 3, "Ana ve 3 jugadores en el lobby");
ok(lobbyAna.creadorId === ana.tuId, "Ana (primera en entrar) es la jefa de estación");
ok(ultimo(cami, "lobby").jugadores.map((j) => j.nombre).join(",") === "Ana,Beto,Cami",
   "orden de llegada correcto para todos");

// 3. Nombre duplicado rechazado
const anaFalsa = clienteNuevo(codigo, "ana");
await espera(500);
const errDup = ultimo(anaFalsa, "error");
ok(errDup && errDup.mensaje.includes("EN USO"), "nombre duplicado rechazado (insensible a mayúsculas)");
ok(!anaFalsa.abierto, "conexión del duplicado cerrada");

// 4. Iniciar con 3 jugadores falla
ana.ws.send(JSON.stringify({ tipo: "iniciar" }));
await espera(400);
ok(ultimo(ana, "error")?.mensaje.includes("4 OPERADORES"), "no se puede iniciar con 3 jugadores");

// 5. Un no-creador no puede iniciar
const dani = clienteNuevo(codigo, "Dani", 5);
await espera(400);
beto.ws.send(JSON.stringify({ tipo: "iniciar" }));
await espera(400);
ok(ultimo(beto, "error")?.mensaje.includes("JEFE"), "solo el creador puede iniciar");

// 6. Desconexión en el lobby actualiza la lista
const eze = clienteNuevo(codigo, "Eze", 6);
await espera(400);
eze.ws.close();
await espera(500);
ok(ultimo(ana, "lobby").jugadores.length === 4, "al desconectarse Eze, los demás ven 4 jugadores");

// 7. Tope de 8 jugadores
const extras = ["F", "G", "H", "I"].map((n) => clienteNuevo(codigo, n));
await espera(600);
const noveno = clienteNuevo(codigo, "Noveno");
await espera(500);
ok(ultimo(noveno, "error")?.mensaje.includes("COMPLETA"), "el 9° jugador es rechazado");

// 8. El creador inicia con 8
ana.ws.send(JSON.stringify({ tipo: "iniciar" }));
await espera(500);
ok(ultimo(dani, "faseCambio")?.fase === "partida", "todos reciben el cambio a fase partida");

// 9. Nadie puede entrar con la partida en curso
const tarde = clienteNuevo(codigo, "Tarde");
await espera(500);
ok(ultimo(tarde, "error")?.mensaje.includes("EN CURSO"), "no se puede entrar con partida en curso");

// 10. Sala vacía se reinicia
[ana, beto, cami, dani, ...extras].forEach((c) => c.ws.close());
await espera(600);
const otra = clienteNuevo(codigo, "Nueva");
await espera(500);
const lobbyNueva = ultimo(otra, "lobby");
ok(lobbyNueva && lobbyNueva.jugadores.length === 1, "sala vaciada vuelve a estado lobby limpio");
otra.ws.close();

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
