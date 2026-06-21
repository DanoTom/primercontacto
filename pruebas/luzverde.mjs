// Prueba del desafío de reflejo "Luz Verde".
// Requiere el servidor forzado a ese desafío:
//   wrangler dev --var MODO_PRUEBA:1 --var SOLO_DESAFIO:luzverde
const BASE = "http://localhost:8788";
const WS = "ws://localhost:8788";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

function cliente(codigo, nombre) {
  const ws = new WebSocket(`${WS}/api/sala/${codigo}/ws`);
  const c = { ws, nombre, mensajes: [], tuId: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar: 0 }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
    if (m.tipo === "luzverde" && c.alTocarVerde) c.alTocarVerde();
  };
  c.enviar = (o) => c.ws.send(JSON.stringify(o));
  return c;
}
const ultimo = (c, t) => [...c.mensajes].reverse().find((m) => m.tipo === t);
const faseDe = (c, f) => c.mensajes.filter((m) => m.tipo === "faseCambio").find((m) => m.fase === f);

const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
const { codigo } = await r.json();
const cls = ["Ana", "Beto", "Cami"].map((n) => cliente(codigo, n));
await espera(500);
cls[0].enviar({ tipo: "iniciar" });
await espera(1500); // pasa la intro y arranca la ronda de luz verde

const d = ultimo(cls[0], "desafio");
ok(d?.tipoDesafio === "luzverde", "la ronda es de luz verde");
ok(!("greenAt" in (d?.datos || {})), "el momento de la luz NO viaja al cliente");

// Ana se adelanta (toca antes de la señal). Beto y Cami esperan la luz.
cls[0].enviar({ tipo: "responder", valor: "tap" });
cls[1].alTocarVerde = () => cls[1].enviar({ tipo: "responder", valor: "tap" });
cls[2].alTocarVerde = () => cls[2].enviar({ tipo: "responder", valor: "tap" });

// Esperamos la PRIMERA resolución (la del round 1); como el servidor
// fuerza luz verde en cada ronda, no hay que pasarse a la siguiente.
let intentos = 0;
while (!cls[0].mensajes.some((m) => m.tipo === "resolucion") && intentos < 50) {
  await espera(100); intentos++;
}
const reso = cls[0].mensajes.find((m) => m.tipo === "resolucion");
ok(!!reso, "se resolvió la ronda de reflejo");
ok(reso.desaparecidos.some((x) => x.id === cls[0].tuId), "Ana se adelantó: el Río se la llevó");
ok(reso.vivos.includes(cls[1].tuId) && reso.vivos.includes(cls[2].tuId),
   "Beto y Cami esperaron la luz y sobrevivieron");
ok(reso.correcta == null, "la resolución de reflejo no trae 'respuesta correcta'");

cls.forEach((c) => c.ws.close());
await espera(300);
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
