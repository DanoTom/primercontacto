// Sonido del aparato: todo sintetizado con Web Audio, sin archivos.
// Arranca apagado (los navegadores exigen un gesto del usuario);
// la perilla del lobby lo enciende y la preferencia se recuerda.

const Sonido = (() => {
  let ctx = null;
  let activo = false;
  let deseo = localStorage.getItem("pc-audio") === "1";
  let nodoZumbido = null;

  function asegurarContexto() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  // Tono simple con envolvente corta.
  function tono(frecuencia, duracion, tipo = "square", ganancia = 0.08, inicio = 0) {
    if (!activo || !ctx) return;
    const t = ctx.currentTime + inicio;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, t);
    vol.gain.setValueAtTime(0, t);
    vol.gain.linearRampToValueAtTime(ganancia, t + 0.005);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(vol).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
  }

  // Ráfaga de ruido (para clicks mecánicos).
  function ruido(duracion, ganancia = 0.1, filtroHz = 3000) {
    if (!activo || !ctx) return;
    const muestras = Math.floor(ctx.sampleRate * duracion);
    const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < muestras; i++) {
      datos[i] = (Math.random() * 2 - 1) * (1 - i / muestras);
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = filtroHz;
    const vol = ctx.createGain();
    vol.gain.value = ganancia;
    fuente.connect(filtro).connect(vol).connect(ctx.destination);
    fuente.start();
  }

  function arrancarZumbido() {
    if (!ctx || nodoZumbido) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 60;
    vol.gain.value = 0.006; // apenas perceptible: el tubo respirando
    osc.connect(vol).connect(ctx.destination);
    osc.start();
    nodoZumbido = { osc, vol };
  }

  function pararZumbido() {
    if (!nodoZumbido) return;
    try {
      nodoZumbido.vol.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
      nodoZumbido.osc.stop(ctx.currentTime + 0.3);
    } catch {}
    nodoZumbido = null;
  }

  function encender() {
    deseo = true;
    activo = true;
    localStorage.setItem("pc-audio", "1");
    asegurarContexto();
    arrancarZumbido();
  }

  function apagar() {
    deseo = false;
    activo = false;
    localStorage.setItem("pc-audio", "0");
    pararZumbido();
  }

  // Si el jugador ya había encendido el audio en otra visita,
  // se reactiva con su primer toque (exigencia de los navegadores).
  document.addEventListener(
    "pointerdown",
    () => {
      if (deseo && !activo) encender();
    },
    { once: true }
  );

  return {
    alternar() {
      if (activo) apagar();
      else encender();
      return activo;
    },
    estaActivo: () => activo,
    quiereAudio: () => deseo,

    // El vocabulario del aparato:
    click() {
      ruido(0.03, 0.12, 5000);
      tono(180, 0.05, "square", 0.04);
    },
    tecla() {
      ruido(0.015, 0.04, 6000);
    },
    transmision() {
      tono(880, 0.09, "square", 0.06);
      tono(660, 0.12, "square", 0.06, 0.1);
    },
    alarma(segundos) {
      // Más agudo y urgente a medida que se acaba el tiempo.
      const frecuencia = segundos <= 10 ? 1400 : 1000;
      tono(frecuencia, 0.07, "square", segundos <= 10 ? 0.09 : 0.05);
    },
    exito() {
      tono(523, 0.12, "square", 0.07);
      tono(659, 0.12, "square", 0.07, 0.13);
      tono(784, 0.25, "square", 0.07, 0.26);
    },
    derrota() {
      tono(330, 0.18, "sawtooth", 0.07);
      tono(247, 0.18, "sawtooth", 0.07, 0.2);
      tono(165, 0.45, "sawtooth", 0.08, 0.4);
    },
    encendidoCRT() {
      if (!activo || !ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(6000, t + 0.4);
      vol.gain.setValueAtTime(0.08, t);
      vol.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(vol).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.6);
    },
  };
})();
