// Prueba de contenido de los desafíos: corre sin servidor.
// Verifica que cada desafío sea válido (la respuesta correcta SIEMPRE
// está entre las opciones) y que la variedad funcione.
import { DESAFIOS, TIPOS, generarDesafio } from "../src/desafios.js";

let fallas = 0;
function ok(cond, desc) {
  console.log((cond ? "✔" : "✘ FALLA:") + " " + desc);
  if (!cond) fallas++;
}

// Cada tipo por opción, generado muchas veces, debe ser resoluble.
for (const [tipo, def] of Object.entries(DESAFIOS)) {
  if (def.reflejo || def.manual || def.cooperativo) {
    // Los especiales (luz verde, orden, simon, sincronía) no se validan
    // por opción: los maneja el cliente o el resultado es grupal.
    ok(!!def.generar().datos, `${tipo}: genera (desafío especial)`);
    continue;
  }
  let todoBien = true;
  let opcionesOk = true;
  for (let ronda = 1; ronda <= 8; ronda++) {
    for (let i = 0; i < 200; i++) {
      const d = def.generar(ronda);
      const ids = d.datos.opciones.map((o) => o.id);
      if (!d.enunciado || ids.length < 2) todoBien = false;
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

// Todos los tipos se generan sin romperse (incluidos los especiales).
ok(TIPOS.length >= 11, `hay al menos 11 desafíos (${TIPOS.length})`);
for (const t of TIPOS) ok(!!generarDesafio(t, 5).datos, `generarDesafio('${t}') funciona`);

// Simulación de la "bolsa": cada vuelta usa todos los tipos una vez,
// y nunca se repite el mismo dos veces seguidas (ni tres).
function simularBolsa(rondas) {
  let bolsa = [], ultimo = null;
  const salida = [];
  const barajar = (a) => { a = [...a]; for (let i=a.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} return a; };
  for (let r = 0; r < rondas; r++) {
    if (bolsa.length === 0) {
      bolsa = barajar(TIPOS);
      if (bolsa[0] === ultimo && bolsa.length > 1) {
        const j = 1 + ((Math.random() * (bolsa.length - 1)) | 0);
        [bolsa[0], bolsa[j]] = [bolsa[j], bolsa[0]];
      }
    }
    const t = bolsa.shift();
    salida.push(t);
    ultimo = t;
  }
  return salida;
}
let sinRepetir = true, sinTres = true;
for (let intento = 0; intento < 500; intento++) {
  const s = simularBolsa(40);
  for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) sinRepetir = false;
  for (let i = 2; i < s.length; i++) if (s[i] === s[i - 1] && s[i] === s[i - 2]) sinTres = false;
}
ok(sinRepetir, "la bolsa nunca repite el mismo desafío dos veces seguidas");
ok(sinTres, "la bolsa nunca repite tres veces seguidas");
// Una vuelta completa usa todos los tipos (orden distinto cada vez).
const vuelta = simularBolsa(TIPOS.length);
ok(new Set(vuelta).size === TIPOS.length, "una vuelta completa usa todos los tipos una vez");

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLAS`);
process.exit(fallas === 0 ? 0 : 1);
