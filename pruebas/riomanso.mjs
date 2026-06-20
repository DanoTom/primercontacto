// Prueba de RÍO MANSO: lobby, rondas, eliminación, victoria y derrota.
// Requiere el servidor en modo prueba: npm run dev:prueba
const BASE = "http://localhost:8787";
const WS = "ws://localhost:8787";

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

// Mismo mapa de colores que el servidor: así el "jugador" simulado
// puede deducir la respuesta correcta del color de la tinta (hex),
// igual que un humano la deduce mirando la pantalla.
const HEX_A_ID = {
  "#ff5040": "rojo", "#5b8def": "azul", "#3fd968": "verde",
  "#ffd23f": "amarillo", "#ff944a": "naranja", "#c07bf0": "violeta",
};

function clienteNuevo(codigo, nombre, avatar = 0) {
  const ws = new WebSocket(`${WS}/api/sala/${codigo}/ws`);
  const c = { ws, nombre, mensajes: [], tuId: null, desafio: null };
  ws.onopen = () => ws.send(JSON.stringify({ tipo: "unirse", nombre, avatar }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.mensajes.push(m);
    if (m.tipo === "bienvenida") c.tuId = m.tuId;
    if (m.tipo === "desafio") c.desafio = m;
  };
  c.enviar = (o) => c.ws.send(JSON.stringify(o));
  return c;
}

const ultimo = (c, tipo) => [...c.mensajes].reverse().find((m) => m.tipo === tipo);
const todos = (c, tipo) => c.mensajes.filter((m) => m.tipo === tipo);
const faseDe = (c, fase) => todos(c, "faseCambio").find((m) => m.fase === fase);

function idCorrecto(desafio) {
  return HEX_A_ID[desafio.datos.tinta];
}
function idIncorrecto(desafio) {
  return desafio.datos.opciones.map((o) => o.id).find((id) => id !== idCorrecto(desafio));
}

async function crear() {
  const r = await fetch(`${BASE}/api/crear`, { method: "POST" });
  return (await r.json()).codigo;
}

// ════════ A: mínimo de jugadores y arranque ════════
console.log("— A: LOBBY Y ARRANQUE —");
{
  const codigo = await crear();
  const ana = clienteNuevo(codigo, "Ana");
  await espera(150);
  const beto = clienteNuevo(codigo, "Beto");
  await espera(400);

  ana.enviar({ tipo: "iniciar" });
  await espera(300);
  ok(ultimo(ana, "error")?.mensaje.includes("3 PERSONAS"), "no se puede empezar con 2");

  const cami = clienteNuevo(codigo, "Cami");
  await espera(400);
  beto.enviar({ tipo: "iniciar" });
  await espera(300);
  ok(ultimo(beto, "error")?.mensaje.includes("ABRIÓ"), "solo el guía puede empezar");

  ana.enviar({ tipo: "iniciar" });
  await espera(300);
  ok(faseDe(cami, "intro"), "con 3 y el guía, arranca la intro");
  ok(ultimo(cami, "faseCambio").texto?.length > 0, "la intro trae texto narrativo");

  [ana, beto, cami].forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ B: ronda, eliminación del que erra, victoria ════════
console.log("— B: ELIMINACIÓN Y VICTORIA —");
{
  const codigo = await crear();
  const cls = ["Uno", "Dos", "Tres", "Cuatro"].map((n) => clienteNuevo(codigo, n));
  await espera(500);
  cls[0].enviar({ tipo: "iniciar" });

  // Espera la primera ronda (tras la intro).
  await espera(1600);
  ok(cls.every((c) => c.desafio), "todos reciben el desafío de la ronda 1");
  ok(cls[0].desafio.datos.opciones.length === 6, "el desafío trae 6 opciones");
  ok(!("correcta" in cls[0].desafio), "el desafío NO revela la respuesta correcta");

  // Tres aciertan, el cuarto (Cuatro) erra a propósito.
  const d = cls[0].desafio;
  cls[0].enviar({ tipo: "responder", valor: idCorrecto(d) });
  cls[1].enviar({ tipo: "responder", valor: idCorrecto(d) });
  cls[2].enviar({ tipo: "responder", valor: idCorrecto(d) });
  cls[3].enviar({ tipo: "responder", valor: idIncorrecto(d) });
  await espera(400);

  const reso = ultimo(cls[0], "resolucion");
  ok(reso?.correcta === idCorrecto(d), "la resolución revela la respuesta correcta");
  ok(reso.desaparecidos.some((x) => x.id === cls[3].tuId), "el que erró es desaparecido");
  ok(reso.vivos.length === 3, "quedan 3 vivos");

  // Las rondas siguientes: los 3 vivos aciertan siempre → llegan al final.
  // El cuarto, ya fantasma, intenta responder y se lo ignora.
  for (let ronda = 2; ronda <= 8; ronda++) {
    // esperar a que llegue la nueva ronda
    let intentos = 0;
    while (ultimo(cls[0], "desafio")?.ronda !== ronda && intentos < 40) {
      await espera(100); intentos++;
    }
    const dr = ultimo(cls[0], "desafio");
    if (!dr || dr.ronda !== ronda) break; // ya terminó
    cls[3].enviar({ tipo: "responder", valor: idCorrecto(dr) }); // fantasma: ignorado
    cls.slice(0, 3).forEach((c) => c.enviar({ tipo: "responder", valor: idCorrecto(dr) }));
    await espera(350);
  }

  await espera(800);
  const fin = faseDe(cls[0], "final");
  ok(!!fin, "la partida llega al final");
  ok(fin?.resultado.ganaron === true, "el grupo gana: hubo sobrevivientes");
  ok(fin?.resultado.sobrevivientes.length === 3, "sobreviven 3 (el que erró no)");
  ok(!fin.resultado.sobrevivientes.some((s) => s.id === cls[3].tuId),
     "el fantasma no figura entre los sobrevivientes");

  // Revancha: todos vuelven al lobby.
  cls[0].enviar({ tipo: "revancha" });
  await espera(400);
  ok(ultimo(cls[2], "lobby")?.jugadores.length === 4, "la revancha devuelve a los 4 al lobby");

  cls.forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ C: si todos erran, el Río se los lleva (derrota) ════════
console.log("— C: DERROTA TOTAL —");
{
  const codigo = await crear();
  const cls = ["A", "B", "C"].map((n) => clienteNuevo(codigo, n));
  await espera(500);
  cls[0].enviar({ tipo: "iniciar" });
  await espera(1600);

  const d = ultimo(cls[0], "desafio");
  cls.forEach((c) => c.enviar({ tipo: "responder", valor: idIncorrecto(d) }));
  await espera(1600); // deja pasar la fase de resolución antes del final

  const fin = faseDe(cls[0], "final");
  ok(!!fin, "la partida termina cuando caen todos");
  ok(fin?.resultado.ganaron === false, "el grupo pierde: nadie sobrevivió");
  ok(fin?.resultado.sobrevivientes.length === 0, "no hay sobrevivientes");

  cls.forEach((c) => c.ws.close());
  await espera(300);
}

// ════════ D: fantasma con una ayuda (escudo y pista) ════════
console.log("— D: FANTASMA CON UNA AYUDA —");
{
  const codigo = await crear();
  const cls = ["Uno", "Dos", "Tres", "Cuatro"].map((n) => clienteNuevo(codigo, n));
  await espera(500);
  cls[0].enviar({ tipo: "iniciar" });
  await espera(1600);

  // Ronda 1: Cuatro erra y cae; los demás aciertan.
  let d = ultimo(cls[0], "desafio");
  cls.slice(0, 3).forEach((c) => c.enviar({ tipo: "responder", valor: idCorrecto(d) }));
  cls[3].enviar({ tipo: "responder", valor: idIncorrecto(d) });
  await espera(1300); // pasa la resolución y arranca la ronda 2
  ok(ultimo(cls[3], "resolucion").desaparecidos.some((x) => x.id === cls[3].tuId),
     "Cuatro cae en la ronda 1 (ahora es fantasma)");

  // Ronda 2: el fantasma (Cuatro) pone un ESCUDO sobre Uno; Uno erra
  // a propósito y, gracias al escudo, igual sobrevive.
  let intentos = 0;
  while (ultimo(cls[0], "desafio")?.ronda !== 2 && intentos < 40) { await espera(100); intentos++; }
  d = ultimo(cls[0], "desafio");
  cls[3].enviar({ tipo: "ayuda", accion: "escudo", objetivoId: cls[0].tuId });
  await espera(250);
  ok(ultimo(cls[3], "ayudaConfirmada")?.accion === "escudo", "el fantasma confirma el escudo");
  ok(ultimo(cls[0], "escudo") != null, "Uno recibe el aviso de escudo");

  cls[0].enviar({ tipo: "responder", valor: idIncorrecto(d) }); // erra, pero está protegido
  cls[1].enviar({ tipo: "responder", valor: idCorrecto(d) });
  cls[2].enviar({ tipo: "responder", valor: idCorrecto(d) });
  await espera(400);
  const reso2 = ultimo(cls[0], "resolucion");
  ok(reso2.vivos.includes(cls[0].tuId), "Uno sobrevive pese a errar: el escudo lo salvó");
  ok(reso2.resultados.find((r) => r.id === cls[0].tuId)?.escudado === true,
     "la resolución marca a Uno como escudado");

  // El fantasma ya gastó su ayuda: un segundo intento se ignora.
  while (ultimo(cls[0], "desafio")?.ronda !== 3 && intentos < 80) { await espera(100); intentos++; }
  cls[3].enviar({ tipo: "ayuda", accion: "escudo", objetivoId: cls[1].tuId });
  await espera(300);
  const confirmaciones = todos(cls[3], "ayudaConfirmada").length;
  ok(confirmaciones === 1, "el fantasma no puede dar una segunda ayuda");

  cls.forEach((c) => c.ws.close());
  await espera(300);
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
