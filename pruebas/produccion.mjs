// Prueba multijugador contra un servidor real (producción o local).
// Uso: BASE_URL=https://... node pruebas/produccion.mjs
const BASE = process.env.BASE_URL || "http://localhost:8787";
const WS = BASE.replace(/^http/, "ws");

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;

function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

function clienteNuevo(codigo, nombre) {
  const ws = new WebSocket(`${WS}/api/sala/${codigo}/ws`);
  const c = { ws, nombre, mensajes: [], abierto: false, rol: null };
  ws.onopen = () => {
    c.abierto = true;
    ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar: 0 }));
  };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "rol") c.rol = m.rol;
  };
  ws.onerror = () => console.log(`  (error de conexión: ${nombre})`);
  ws.onclose = () => { c.abierto = false; };
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);

console.log(`Probando contra: ${BASE}`);

const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
const { codigo } = await r.json();
ok(/^[A-Z]{4}$/.test(codigo), `sala creada (${codigo})`);

const nombres = ["Uno", "Dos", "Tres", "Cuatro", "Cinco"];
const clientes = [];
for (const n of nombres) {
  clientes.push(clienteNuevo(codigo, n));
  await espera(400);
}
await espera(1500);

ok(clientes.every((c) => c.abierto), "las 5 conexiones siguen abiertas");
const lobby = ultimo(clientes[4], "lobby");
ok(lobby?.jugadores.length === 5,
   `el lobby muestra 5 jugadores (vio: ${lobby?.jugadores.length})`);
clientes.forEach((c, i) => {
  const propio = ultimo(c, "lobby");
  ok(propio?.jugadores.length === 5, `${nombres[i]} ve a los 5`);
});

// Iniciar: los roles llegan a todos.
clientes[0].enviar = (o) => clientes[0].ws.send(JSON.stringify(o));
clientes[0].ws.send(JSON.stringify({ tipo: "iniciar" }));
await espera(1500);
ok(clientes.every((c) => c.rol), "los 5 reciben su rol al iniciar");

clientes.forEach((c) => c.ws.close());
await espera(300);
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
