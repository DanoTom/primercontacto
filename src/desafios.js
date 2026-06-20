// Los desafíos del Río Manso. Cada uno es un módulo con generar(ronda):
// devuelve { enunciado, datos (públicos), correcta (secreta) }.
// El servidor guarda "correcta" y nunca la manda hasta la resolución.
//
// Para sumar un desafío nuevo: agregá una entrada acá y su dibujo en
// el cliente (public/app.js → dibujarDesafio).

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

// Colores legibles sobre el monitor CRT.
const COLORES = [
  { id: "rojo", nombre: "ROJO", hex: "#ff5040" },
  { id: "azul", nombre: "AZUL", hex: "#5b8def" },
  { id: "verde", nombre: "VERDE", hex: "#3fd968" },
  { id: "amarillo", nombre: "AMARILLO", hex: "#ffd23f" },
  { id: "naranja", nombre: "NARANJA", hex: "#ff944a" },
  { id: "violeta", nombre: "VIOLETA", hex: "#c07bf0" },
];

export const DESAFIOS = {
  // "El color miente": una palabra-color pintada de OTRO color.
  // Hay que tocar el color de la TINTA, no el que dice la palabra.
  stroop: {
    nombre: "EL COLOR MIENTE",
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
};

// Por ahora siempre "El color miente". Cuando haya más desafíos,
// acá se elige según la ronda para variar el ritmo.
export function elegirDesafio(ronda) {
  const tipos = Object.keys(DESAFIOS);
  const tipo = tipos[Math.floor(Math.random() * tipos.length)];
  const d = DESAFIOS[tipo].generar(ronda);
  return { tipo, ...d };
}
