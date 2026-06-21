// Prueba del desafío cooperativo "¡todos a la vez!".
// Requiere el servidor forzado a ese desafío:
//   wrangler dev --port 8788 --var MODO_PRUEBA:1 --var SOLO_DESAFIO:sincronia
const WS = "ws://localhost:8788", BASE = "http://localhost:8788";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
function ok(c, d) { console.log((c ? "✔" : "✘ FALLA:") + " " + d); if (!c) fallas++; }

function cli(codigo, nombre) {
  const ws = new WebSocket(`${WS}/api/sala/${codigo}/ws`);
  const c = { ws, nombre, m: [], tuId: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar: 0 }));
  ws.onmessage = (e) => { const x = JSON.parse(e.data); c.m.push(x); if (x.tipo === "bienvenida") c.tuId = x.tuId; };
  c.enviar = (o) => c.ws.send(JSON.stringify(o));
  return c;
}
const primero = (c, t) => c.m.find((x) => x.tipo === t);

const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
const { codigo } = await r.json();
const cls = ["Ana", "Beto", "Cami"].map((n) => cli(codigo, n));
await espera(500);
cls[0].enviar({ tipo: "iniciar" });
await espera(1600); // pasa la intro y arranca la ronda cooperativa

const d = primero(cls[0], "desafio");
ok(d?.tipoDesafio === "sincronia", "la ronda es el cooperativo 'todos a la vez'");

// Ana y Beto tocan juntos; Cami se cuelga (toca 2 s tarde).
cls[0].enviar({ tipo: "responder", valor: "tap" });
cls[1].enviar({ tipo: "responder", valor: "tap" });
await espera(2000);
cls[2].enviar({ tipo: "responder", valor: "tap" });
await espera(600);

const reso = primero(cls[0], "resolucion");
ok(!!reso, "se resolvió la ronda cooperativa");
ok(reso.cooperativo === true, "la resolución viene marcada como cooperativa");
ok(reso.vivos.includes(cls[0].tuId) && reso.vivos.includes(cls[1].tuId),
   "los que tocaron juntos sobreviven");
ok(reso.desaparecidos.some((x) => x.id === cls[2].tuId),
   "el que se descolgó cae");

cls.forEach((c) => c.ws.close());
await espera(300);
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
