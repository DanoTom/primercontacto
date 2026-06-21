// Los desafíos del Río Manso. Cada uno es un módulo con generar(ronda):
// devuelve { enunciado, datos (públicos), correcta (secreta) }.
// El servidor guarda "correcta" y nunca la manda hasta la resolución.
//
// Los desafíos con `reflejo:true` (Luz Verde) no se validan por opción
// sino por tiempo de reacción: el servidor maneja su lógica aparte.
//
// Para sumar un desafío nuevo: agregá una entrada en DESAFIOS y su
// dibujo en el cliente (public/app.js → dibujarDesafio).

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

// Arma opciones numéricas: la correcta + distractores cercanos únicos.
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

// ─── "El color miente" (Stroop) ───
const COLORES = [
  { id: "rojo", nombre: "ROJO", hex: "#ff5040" },
  { id: "azul", nombre: "AZUL", hex: "#5b8def" },
  { id: "verde", nombre: "VERDE", hex: "#3fd968" },
  { id: "amarillo", nombre: "AMARILLO", hex: "#ffd23f" },
  { id: "naranja", nombre: "NARANJA", hex: "#ff944a" },
  { id: "violeta", nombre: "VIOLETA", hex: "#c07bf0" },
];

// ─── "El intruso": categorías de cosas concretas y rioplatenses ───
const CATEGORIAS = {
  animales: ["PERRO", "GATO", "CABALLO", "VACA", "GALLINA", "CONEJO", "OSO", "TIGRE"],
  frutas: ["MANZANA", "BANANA", "PERA", "NARANJA", "FRUTILLA", "DURAZNO", "UVA"],
  muebles: ["MESA", "SILLA", "CAMA", "ROPERO", "SILLÓN", "ESTANTE"],
  vehiculos: ["AUTO", "COLECTIVO", "BICI", "MOTO", "TREN", "AVIÓN", "BARCO"],
  ropa: ["CAMPERA", "PANTALÓN", "REMERA", "GORRO", "MEDIAS", "BUFANDA"],
  oficios: ["MÉDICO", "MAESTRO", "BOMBERO", "PANADERO", "PLOMERO", "CARTERO"],
};

// Figuras para los desafíos visuales.
const FIGURAS = ["▲", "●", "■", "◆", "★", "♥"];

export const DESAFIOS = {
  // Una palabra-color pintada de OTRO color. Tocá el color de la TINTA.
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
      };
    },
  },

  // Tres cosas de una categoría y una colada de otra. Tocá la que sobra.
  intruso: {
    generar() {
      const nombres = Object.keys(CATEGORIAS);
      const catA = elegir(nombres);
      let catB = elegir(nombres);
      while (catB === catA) catB = elegir(nombres);
      const tres = barajar(CATEGORIAS[catA]).slice(0, 3);
      const intruso = elegir(CATEGORIAS[catB]);
      const opciones = barajar(
        [...tres, intruso].map((p) => ({ id: p, nombre: p }))
      );
      return {
        enunciado: "TOCÁ LA QUE NO PERTENECE AL GRUPO",
        datos: { tipo: "intruso", opciones },
        correcta: intruso,
      };
    },
  },

  // Una cuenta rápida. La dificultad sube con la ronda.
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
      };
    },
  },

  // Una secuencia con una regla. ¿Qué número sigue?
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
      };
    },
  },

  // VISUAL: una grilla de triángulos; uno está girado distinto. Tocalo.
  distinto: {
    generar(ronda = 1) {
      const cantidad = Math.min(12, 5 + ronda);
      const cols = cantidad <= 6 ? 3 : 4;
      // La diferencia de giro se achica con la ronda: cada vez más sutil.
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
      };
    },
  },

  // VISUAL: un montón de figuras mezcladas. ¿Cuántas de una clase hay?
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
      };
    },
  },

  // VISUAL: una secuencia de figuras que se repite. ¿Cuál sigue?
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
      };
    },
  },

  // REFLEJO: esperá la luz verde y tocá. Si te adelantás, caés.
  // El servidor maneja el tiempo de la luz y valida por reacción.
  luzverde: {
    reflejo: true,
    generar() {
      return {
        enunciado: "ESPERÁ LA LUZ VERDE Y TOCÁ",
        datos: { tipo: "luzverde" },
        correcta: null,
      };
    },
  },
};

// Elige el desafío de la ronda. La primera siempre es suave (Stroop);
// después varía. "forzar" puede ser:
//   - un nombre de desafío (string) → siempre ese (para pruebas)
//   - true → siempre Stroop (modo prueba determinista)
//   - false → variedad normal
export function elegirDesafio(ronda, forzar = false) {
  let tipo;
  if (typeof forzar === "string" && DESAFIOS[forzar]) {
    tipo = forzar;
  } else if (forzar || ronda === 1) {
    tipo = "stroop";
  } else {
    const tipos = Object.keys(DESAFIOS);
    tipo = tipos[Math.floor(Math.random() * tipos.length)];
  }
  const d = DESAFIOS[tipo].generar(ronda);
  return { tipo, ...d };
}
