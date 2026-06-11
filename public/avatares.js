// Colores de fósforo de la terminal: variaciones de verde, ámbar y
// cian compatibles con CRT. El servidor asigna uno por jugador.
const COLORES = [
  "#33ff66", // verde clásico
  "#ffb000", // ámbar
  "#66ffe0", // cian
  "#aaff33", // lima
  "#ff9966", // naranja suave
  "#99ccff", // celeste
  "#ffe066", // amarillo
  "#66ff99", // verde claro
];

// El personal de la estación: 30 retratos pixelart (arte del director
// creativo, recortados de las placas en arte/). El índice es lo único
// que viaja por la red.
const CANT_AVATARES = 30;
const AVATARES = Array.from({ length: CANT_AVATARES }, (_, i) => ({
  img: `img/avatares/a${String(i).padStart(2, "0")}.png`,
  nombre: `FICHA ${String(i + 1).padStart(2, "0")}`,
}));
