// Los desafíos del Río Manso. Cada uno es un módulo con generar(ronda):
// devuelve { enunciado, datos (públicos), correcta (secreta) }.
// El servidor guarda "correcta" y nunca la manda hasta la resolución.
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
        // multiplicativa
        const r = 2 + Math.floor(Math.random() * 2); // ×2 o ×3
        serie = [inicio, inicio * r, inicio * r * r, inicio * r * r * r];
        siguiente = serie[3] * r;
      } else {
        // aritmética
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
};

// Elige el desafío de la ronda. La primera siempre es suave (Stroop);
// después varía. Con soloStroop (modo prueba) es siempre el mismo,
// para que las pruebas automáticas sean deterministas.
export function elegirDesafio(ronda, soloStroop = false) {
  let tipo;
  if (soloStroop || ronda === 1) {
    tipo = "stroop";
  } else {
    const tipos = Object.keys(DESAFIOS);
    tipo = tipos[Math.floor(Math.random() * tipos.length)];
  }
  const d = DESAFIOS[tipo].generar(ronda);
  return { tipo, ...d };
}
