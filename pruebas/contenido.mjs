// Prueba de contenido de los desafíos: corre sin servidor.
// Verifica que cada desafío sea válido (la respuesta correcta SIEMPRE
// está entre las opciones) y que la variedad funcione.
import { DESAFIOS, elegirDesafio } from "../src/desafios.js";

let fallas = 0;
function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

// Cada tipo, generado muchas veces, debe ser siempre resoluble.
for (const [tipo, def] of Object.entries(DESAFIOS)) {
  let todoBien = true;
  let opcionesOk = true;
  for (let ronda = 1; ronda <= 8; ronda++) {
    for (let i = 0; i < 200; i++) {
      const d = def.generar(ronda);
      const ids = d.datos.opciones.map((o) => o.id);
      if (!d.enunciado || ids.length < 3) todoBien = false;
      if (!ids.includes(d.correcta)) opcionesOk = false;
      if (new Set(ids).size !== ids.length) opcionesOk = false; // sin repetidos
    }
  }
  ok(todoBien, `${tipo}: genera enunciado y opciones`);
  ok(opcionesOk, `${tipo}: la respuesta correcta siempre está entre las opciones (sin repetidos)`);
}

// Chequeos específicos por tipo.
const s = DESAFIOS.stroop.generar();
ok(/^#/.test(s.datos.tinta), "stroop: la tinta es un color");
ok(s.datos.palabra.toLowerCase() !== s.correcta, "stroop: la palabra dice un color distinto al de la tinta");

let calculoOk = true;
for (let i = 0; i < 500; i++) {
  const c = DESAFIOS.calculo.generar(1 + (i % 8));
  const [a, op, b] = c.datos.expresion.split(" ");
  const r = op === "+" ? +a + +b : op === "−" ? +a - +b : +a * +b;
  if (String(r) !== c.correcta || r < 0) calculoOk = false;
}
ok(calculoOk, "calculo: la cuenta da siempre el resultado correcto y no negativo");

const p = DESAFIOS.patron.generar(2);
ok(p.datos.secuencia.includes("?"), "patron: la secuencia termina en incógnita");

// La elección por ronda: la 1 siempre suave; el modo prueba fija stroop.
ok(elegirDesafio(1).tipo === "stroop", "la ronda 1 siempre es Stroop (gentil)");
ok(elegirDesafio(5, true).tipo === "stroop", "en modo prueba siempre es Stroop (determinista)");
const tipos = new Set();
for (let i = 0; i < 300; i++) tipos.add(elegirDesafio(5).tipo);
ok(tipos.size >= 2, `de la ronda 2 en adelante hay variedad (vistos: ${[...tipos].join(", ")})`);

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
