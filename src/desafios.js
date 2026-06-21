// Los desafíos del Río Manso. Cada uno es un módulo con generar(ronda):
// devuelve { enunciado, datos (públicos), correcta (secreta), tiempo }.
// "tiempo" = los milisegundos cómodos para resolverlo a ritmo tranquilo;
// el servidor lo ajusta por ronda (más apretado al avanzar, pero nunca
// imposible). El servidor guarda "correcta" y no la manda hasta resolver.
//
// Flags especiales:
//   reflejo:true   → se valida por tiempo de reacción (luz verde)
//   manual:true    → el cliente valida y avisa "ok"/"fail" (orden, simon)
//   cooperativo:true → resultado grupal por coordinación (todos a la vez)

function elegir(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function opcionesNumericas(correcto, cantidad = 4, dispersion = 5) {
  const valores = new Set([correcto]);
  let intentos = 0;
  while (valores.size < cantidad && intentos < 100) {
    intentos++;
    const delta = Math.floor(Math.random() * dispersion) + 1;
    const cand = correcto + (Math.random() < 0.5 ? -delta : delta);
    if (cand >= 0) valores.add(cand);
  }
  return barajar([...valores]).map((n) => ({ id: String(n), nombre: String(n) }));
}

const COLORES = [
  { id: "rojo", nombre: "ROJO", hex: "#ff5040" },
  { id: "azul", nombre: "AZUL", hex: "#5b8def" },
  { id: "verde", nombre: "VERDE", hex: "#3fd968" },
  { id: "amarillo", nombre: "AMARILLO", hex: "#ffd23f" },
  { id: "naranja", nombre: "NARANJA", hex: "#ff944a" },
  { id: "violeta", nombre: "VIOLETA", hex: "#c07bf0" },
];

const CATEGORIAS = {
  animales: ["PERRO", "GATO", "CABALLO", "VACA", "GALLINA", "CONEJO", "OSO", "TIGRE"],
  frutas: ["MANZANA", "BANANA", "PERA", "NARANJA", "FRUTILLA", "DURAZNO", "UVA"],
  muebles: ["MESA", "SILLA", "CAMA", "ROPERO", "SILLÓN", "ESTANTE"],
  vehiculos: ["AUTO", "COLECTIVO", "BICI", "MOTO", "TREN", "AVIÓN", "BARCO"],
  ropa: ["CAMPERA", "PANTALÓN", "REMERA", "GORRO", "MEDIAS", "BUFANDA"],
  oficios: ["MÉDICO", "MAESTRO", "BOMBERO", "PANADERO", "PLOMERO", "CARTERO"],
};

const FIGURAS = ["▲", "●", "■", "◆", "★", "♥"];

export const DESAFIOS = {
  stroop: {
    generar() {
      const palabra = elegir(COLORES);
      let tinta = elegir(COLORES);
      while (tinta.id === palabra.id) tinta = elegir(COLORES);
      return {
        enunciado: "¿DE QUÉ COLOR ESTÁ ESCRITA LA PALABRA?",
        datos: {
          tipo: "stroop",
          palabra: palabra.nombre,
          tinta: tinta.hex,
          opciones: barajar(COLORES).map((c) => ({ id: c.id, nombre: c.nombre })),
        },
        correcta: tinta.id,
        tiempo: 4500,
      };
    },
  },

  intruso: {
    generar() {
      const nombres = Object.keys(CATEGORIAS);
      const catA = elegir(nombres);
      let catB = elegir(nombres);
      while (catB === catA) catB = elegir(nombres);
      const tres = barajar(CATEGORIAS[catA]).slice(0, 3);
      const intruso = elegir(CATEGORIAS[catB]);
      const opciones = barajar([...tres, intruso].map((p) => ({ id: p, nombre: p })));
      return {
        enunciado: "TOCÁ LA QUE NO PERTENECE AL GRUPO",
        datos: { tipo: "intruso", opciones },
        correcta: intruso,
        tiempo: 5000,
      };
    },
  },

  calculo: {
    generar(ronda = 1) {
      const tope = 6 + ronda * 2;
      const usarPor = ronda >= 3 && Math.random() < 0.4;
      let a, b, op, resultado;
      if (usarPor) {
        a = 2 + Math.floor(Math.random() * Math.min(9, 3 + ronda));
        b = 2 + Math.floor(Math.random() * 8);
        op = "×";
        resultado = a * b;
      } else if (Math.random() < 0.5) {
        a = 2 + Math.floor(Math.random() * tope);
        b = 2 + Math.floor(Math.random() * tope);
        op = "+";
        resultado = a + b;
      } else {
        a = 5 + Math.floor(Math.random() * tope);
        b = 2 + Math.floor(Math.random() * (a - 1));
        op = "−";
        resultado = a - b;
      }
      return {
        enunciado: "RESOLVÉ ANTES DE QUE SE CORTE",
        datos: {
          tipo: "calculo",
          expresion: `${a} ${op} ${b}`,
          opciones: opcionesNumericas(resultado, 4, usarPor ? 8 : 4),
        },
        correcta: String(resultado),
        tiempo: 5500,
      };
    },
  },

  patron: {
    generar(ronda = 1) {
      const inicio = 1 + Math.floor(Math.random() * 6);
      let serie, siguiente;
      if (ronda >= 4 && Math.random() < 0.4) {
        const r = 2 + Math.floor(Math.random() * 2);
        serie = [inicio, inicio * r, inicio * r * r, inicio * r * r * r];
        siguiente = serie[3] * r;
      } else {
        const paso = 2 + Math.floor(Math.random() * (2 + ronda));
        serie = [inicio, inicio + paso, inicio + 2 * paso, inicio + 3 * paso];
        siguiente = inicio + 4 * paso;
      }
      return {
        enunciado: "¿QUÉ NÚMERO SIGUE?",
        datos: {
          tipo: "patron",
          secuencia: serie.join("  ·  ") + "  ·  ?",
          opciones: opcionesNumericas(siguiente, 4, Math.max(3, Math.round(siguiente * 0.2))),
        },
        correcta: String(siguiente),
        tiempo: 5500,
      };
    },
  },

  distinto: {
    generar(ronda = 1) {
      const cantidad = Math.min(12, 5 + ronda);
      const cols = cantidad <= 6 ? 3 : 4;
      const giro = Math.max(28, 190 - ronda * 22);
      const odd = Math.floor(Math.random() * cantidad);
      const opciones = [];
      for (let i = 0; i < cantidad; i++) {
        opciones.push({ id: "c" + i, char: "▲", rot: i === odd ? giro : 0 });
      }
      return {
        enunciado: "TOCÁ EL TRIÁNGULO GIRADO DISTINTO",
        datos: { tipo: "distinto", cols, opciones },
        correcta: "c" + odd,
        tiempo: 3500 + cantidad * 280,
      };
    },
  },

  cuantos: {
    generar(ronda = 1) {
      const total = Math.min(26, 9 + ronda * 2);
      const target = 2 + Math.floor(Math.random() * (total - 4));
      const figuras = [];
      for (let i = 0; i < target; i++) figuras.push("▲");
      for (let i = target; i < total; i++) figuras.push("●");
      return {
        enunciado: "¿CUÁNTOS ▲ HAY?",
        datos: {
          tipo: "cuantos",
          figuras: barajar(figuras),
          opciones: opcionesNumericas(target, 4, Math.max(2, Math.round(total * 0.18))),
        },
        correcta: String(target),
        tiempo: 3000 + total * 200,
      };
    },
  },

  figurafalta: {
    generar(ronda = 1) {
      const simbolos = barajar(FIGURAS);
      const largoCiclo = ronda >= 4 ? 3 : 2;
      const ciclo = simbolos.slice(0, largoCiclo);
      const visual = [];
      for (let i = 0; i < 5; i++) visual.push(ciclo[i % ciclo.length]);
      const siguiente = ciclo[5 % ciclo.length];
      const opcSet = new Set([siguiente, ...ciclo]);
      for (const s of simbolos) {
        if (opcSet.size >= 4) break;
        opcSet.add(s);
      }
      return {
        enunciado: "¿QUÉ FIGURA SIGUE?",
        datos: {
          tipo: "figurafalta",
          secuencia: [...visual, "?"],
          opciones: barajar([...opcSet]).map((c) => ({ id: c, nombre: c })),
        },
        correcta: siguiente,
        tiempo: 4800,
      };
    },
  },

  igualdistinto: {
    generar(ronda = 1) {
      const largo = Math.min(8, 3 + Math.floor(ronda / 2));
      const fila1 = [];
      for (let i = 0; i < largo; i++) fila1.push(elegir(FIGURAS));
      const fila2 = [...fila1];
      const iguales = Math.random() < 0.5;
      if (!iguales) {
        const k = Math.floor(Math.random() * largo);
        let nuevo = elegir(FIGURAS);
        while (nuevo === fila2[k]) nuevo = elegir(FIGURAS);
        fila2[k] = nuevo;
      }
      return {
        enunciado: "¿LAS DOS FILAS SON IGUALES?",
        datos: {
          tipo: "igualdistinto",
          fila1,
          fila2,
          opciones: [
            { id: "si", nombre: "IGUALES" },
            { id: "no", nombre: "DISTINTAS" },
          ],
        },
        correcta: iguales ? "si" : "no",
        tiempo: 3000 + largo * 450,
      };
    },
  },

  // ATENCIÓN (Tabla de Schulte): tocá los números en orden.
  orden: {
    manual: true,
    generar(ronda = 1) {
      const n = Math.min(12, 5 + ronda);
      const cols = n <= 6 ? 3 : 4;
      const nums = barajar(Array.from({ length: n }, (_, i) => i + 1));
      return {
        enunciado: `TOCÁ DEL 1 AL ${n} EN ORDEN`,
        datos: {
          tipo: "orden",
          cols,
          total: n,
          celdas: nums.map((v, i) => ({ id: "p" + i, n: v })),
        },
        correcta: "ok",
        tiempo: 1800 + n * 750, // ~0,75 s por número: difícil pero posible
      };
    },
  },

  // MEMORIA (Simon): repetí la secuencia de luces.
  simon: {
    manual: true,
    generar(ronda = 1) {
      const largo = Math.min(6, 3 + Math.floor((ronda - 1) / 2));
      const secuencia = [];
      for (let i = 0; i < largo; i++) secuencia.push(Math.floor(Math.random() * 4));
      return {
        enunciado: "MEMORIZÁ Y REPETÍ LA SECUENCIA",
        datos: { tipo: "simon", pads: 4, secuencia, mostrarMs: largo * 650 + 700 },
        correcta: "ok",
      };
    },
  },

  // REFLEJO (luz verde): esperá la señal y tocá.
  luzverde: {
    reflejo: true,
    generar() {
      return { enunciado: "ESPERÁ LA LUZ VERDE Y TOCÁ", datos: { tipo: "luzverde" }, correcta: null };
    },
  },

  // COOPERATIVO (¡todos a la vez!): el grupo tiene que tocar SINCRONIZADO.
  // Se coordinan en voz alta ("¡a la cuenta de tres!") y tocan juntos.
  // Quien se descuelga, cae; si sincronizan, sobreviven todos.
  sincronia: {
    cooperativo: true,
    generar() {
      return {
        enunciado: "¡TOQUEN TODOS A LA VEZ!",
        datos: { tipo: "sincronia" },
        correcta: null,
      };
    },
  },
};

// Lista de tipos disponibles (la usa el servidor para rotar sin repetir).
export const TIPOS = Object.keys(DESAFIOS);

export function generarDesafio(tipo, ronda) {
  const d = DESAFIOS[tipo].generar(ronda);
  return { tipo, ...d };
}
