// Prueba de la Etapa 2: la Terminal en vivo.
// (Actualizada en la Etapa 3: ahora hay roles, y el Contactado no
// teclea, así que las pruebas de tipeo usan jugadores con teclado.)
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
  const c = { ws, nombre, mensajes: [], tuId: null, rol: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
    if (m.tipo === "rol") c.rol = m.rol;
  };
  c.enviar = (obj) => c.ws.send(JSON.stringify(obj));
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);
const todos = (c, tipo) => c.mensajes.filter((m) => m.tipo === tipo);

// Preparación: sala con 4 jugadores, partida iniciada.
const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
const { codigo } = await r.json();
const ana = clienteNuevo(codigo, "Ana");
await espera(400);
const beto = clienteNuevo(codigo, "Beto", 1);
const cami = clienteNuevo(codigo, "Cami", 2);
const dani = clienteNuevo(codigo, "Dani", 3);
const clientes = [ana, beto, cami, dani];
await espera(600);

// 1. Tecleo antes de iniciar la partida: ignorado.
ana.enviar({ tipo: "tecleo", texto: "anticipado" });
await espera(300);
ok(!ultimo(beto, "tecleo"), "el tecleo en fase lobby se ignora");

ana.enviar({ tipo: "iniciar" });
await espera(400);
clientes.forEach((c) => c.enviar({ tipo: "entendido" }));
await espera(500);

// 2. faseCambio trae la lista de jugadores con colores.
const fc = ultimo(cami, "faseCambio");
ok(fc && fc.jugadores?.length === 4, "faseCambio incluye los 4 jugadores");
const colores = fc.jugadores.map((j) => j.color);
ok(new Set(colores).size === 4, `colores todos distintos (${colores.join(",")})`);

// Los actores con teclado: todos menos el Contactado (que observa).
const [x, y, z] = clientes.filter((c) => c.rol !== "contactado");
const observador = clientes.find((c) => c.rol === "contactado");

// 3. Tecleo en vivo: los demás lo ven, quien teclea no recibe eco.
x.enviar({ tipo: "tecleo", texto: "es un anim" });
await espera(300);
ok(ultimo(y, "tecleo")?.texto === "es un anim", "los demás ven el borrador en vivo");
ok(ultimo(observador, "tecleo")?.texto === "es un anim", "el contactado también lo ve");
ok(todos(x, "tecleo").length === 0, "quien teclea no recibe eco de su propio texto");

// 4. El borrón también se transmite.
x.enviar({ tipo: "tecleo", texto: "es un" });
await espera(300);
ok(ultimo(y, "tecleo")?.texto === "es un", "el borrón llega (texto más corto)");

// 5. Mensaje enviado: llega a todos, incluido el autor, con nombre y color.
x.enviar({ tipo: "enviar", texto: "una pregunta cualquiera" });
await espera(300);
const msgX = ultimo(x, "mensaje");
ok(msgX?.texto === "una pregunta cualquiera", "el autor ve su mensaje en el historial");
ok(msgX?.nombre === x.nombre, "el mensaje lleva el nombre");
ok(typeof msgX?.color === "number", "el mensaje lleva el color");
ok(ultimo(observador, "mensaje")?.texto === "una pregunta cualquiera", "todos reciben el mensaje");

// 6. Mensaje vacío o de espacios: ignorado.
y.enviar({ tipo: "enviar", texto: "   " });
await espera(300);
ok(todos(z, "mensaje").length === 1, "el mensaje vacío no se difunde");

// 7. Texto gigante: truncado a 200.
y.enviar({ tipo: "enviar", texto: "x".repeat(500) });
await espera(300);
ok(ultimo(z, "mensaje")?.texto.length === 200, "mensaje largo truncado a 200");

// 8. Tecleo simultáneo de dos jugadores: atribución correcta.
y.enviar({ tipo: "tecleo", texto: "pregunto si vuela" });
z.enviar({ tipo: "tecleo", texto: "pienso otra cosa" });
await espera(300);
const tecleos = todos(observador, "tecleo");
const deY = tecleos.filter((t) => t.jugadorId === y.tuId).pop();
const deZ = tecleos.filter((t) => t.jugadorId === z.tuId).pop();
ok(deY?.texto === "pregunto si vuela", "el tecleo simultáneo se atribuye bien (1/2)");
ok(deZ?.texto === "pienso otra cosa", "el tecleo simultáneo se atribuye bien (2/2)");

// 9. Desconexión a mitad de tecleo: la línea viva se borra para el resto.
z.ws.close();
await espera(400);
const limpieza = todos(y, "tecleo").filter((t) => t.jugadorId === z.tuId).pop();
ok(limpieza?.texto === "", "al irse un jugador, su línea viva se limpia");

[ana, beto, cami, dani].forEach((c) => c.ws.close());
await espera(300);
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
