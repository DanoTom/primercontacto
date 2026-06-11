// Prueba de la Etapa 2: la Terminal en vivo.
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
  const c = { ws, nombre, mensajes: [], tuId: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
  };
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
await espera(600);

// 1. Tecleo antes de iniciar la partida: ignorado.
ana.ws.send(JSON.stringify({ tipo: "tecleo", texto: "anticipado" }));
await espera(300);
ok(!ultimo(beto, "tecleo"), "el tecleo en fase lobby se ignora");

ana.ws.send(JSON.stringify({ tipo: "iniciar" }));
await espera(400);

// 2. faseCambio trae la lista de jugadores con colores.
const fc = ultimo(cami, "faseCambio");
ok(fc && fc.jugadores?.length === 4, "faseCambio incluye los 4 jugadores");
const colores = fc.jugadores.map((j) => j.color);
ok(new Set(colores).size === 4, `colores todos distintos (${colores.join(",")})`);

// 3. Tecleo en vivo: los demás lo ven, quien teclea no recibe eco.
ana.ws.send(JSON.stringify({ tipo: "tecleo", texto: "es un anim" }));
await espera(300);
ok(ultimo(beto, "tecleo")?.texto === "es un anim", "Beto ve el borrador de Ana");
ok(ultimo(dani, "tecleo")?.texto === "es un anim", "Dani también lo ve");
ok(todos(ana, "tecleo").length === 0, "Ana no recibe eco de su propio tecleo");

// 4. El borrón también se transmite.
ana.ws.send(JSON.stringify({ tipo: "tecleo", texto: "es un" }));
await espera(300);
ok(ultimo(beto, "tecleo")?.texto === "es un", "el borrón de Ana llega (texto más corto)");

// 5. Mensaje enviado: llega a todos, incluida Ana, con nombre y color.
ana.ws.send(JSON.stringify({ tipo: "enviar", texto: "¿es un animal?" }));
await espera(300);
const msgAna = ultimo(ana, "mensaje");
ok(msgAna?.texto === "¿es un animal?", "Ana ve su propio mensaje en el historial");
ok(msgAna?.nombre === "Ana", "el mensaje lleva el nombre");
ok(typeof msgAna?.color === "number", "el mensaje lleva el color");
ok(ultimo(dani, "mensaje")?.texto === "¿es un animal?", "Dani recibe el mensaje");

// 6. Mensaje vacío o de espacios: ignorado.
beto.ws.send(JSON.stringify({ tipo: "enviar", texto: "   " }));
await espera(300);
ok(todos(cami, "mensaje").length === 1, "el mensaje vacío no se difunde");

// 7. Texto gigante: truncado a 200.
const gigante = "x".repeat(500);
beto.ws.send(JSON.stringify({ tipo: "enviar", texto: gigante }));
await espera(300);
ok(ultimo(cami, "mensaje")?.texto.length === 200, "mensaje largo truncado a 200");

// 8. Tecleo simultáneo de dos jugadores: atribución correcta.
beto.ws.send(JSON.stringify({ tipo: "tecleo", texto: "yo pregunto si vuela" }));
cami.ws.send(JSON.stringify({ tipo: "tecleo", texto: "yo pienso otra cosa" }));
await espera(300);
const tecleosDani = todos(dani, "tecleo");
const deBeto = tecleosDani.filter((t) => t.jugadorId === beto.tuId).pop();
const deCami = tecleosDani.filter((t) => t.jugadorId === cami.tuId).pop();
ok(deBeto?.texto === "yo pregunto si vuela", "el tecleo de Beto llega atribuido a Beto");
ok(deCami?.texto === "yo pienso otra cosa", "el tecleo de Cami llega atribuido a Cami");

// 9. Desconexión a mitad de tecleo: la línea viva se borra para el resto.
cami.ws.close();
await espera(400);
const limpiezaCami = todos(dani, "tecleo")
  .filter((t) => t.jugadorId === cami.tuId)
  .pop();
ok(limpiezaCami?.texto === "", "al irse Cami, su línea viva se limpia (texto vacío)");

[ana, beto, dani].forEach((c) => c.ws.close());
await espera(300);
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
