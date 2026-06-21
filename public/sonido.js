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

  // ─── La música del aparato ───
  // Sintetizador de terror ochentoso (estilo Carpenter / Stranger
  // Things): un ostinato hipnótico en Re menor que alterna el La con
  // el Lab (el tritono, la nota de la desazón), un latido grave y un
  // drone de fondo que respira. Todo original, sin archivos.
  const PASO_MUSICA = 0.15; // semicorcheas a ~100 BPM
  const ARPEGIO = [
    146.83, 220.0, 293.66, 220.0, 174.61, 220.0, 293.66, 220.0,     // Dm (con La)
    146.83, 207.65, 293.66, 207.65, 174.61, 207.65, 261.63, 207.65, // tritono (con Lab)
  ];
  const PULSO_GRAVE = 73.42; // Re1: el latido
  const DRONE_GRAVE = 36.71; // Re0: el drone de fondo

  let musicaDeseada = false;
  let musica = null;

  // Una voz del ostinato: dos sierras apenas desafinadas (calor
  // analógico) por un filtro resonante, con envolvente de pluck.
  function notaMusica(frecuencia, t, duracion, destino) {
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 900;
    filtro.Q.value = 7;
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(0, t);
    vol.gain.linearRampToValueAtTime(0.06, t + 0.012);
    vol.gain.exponentialRampToValueAtTime(0.0008, t + duracion);
    for (const det of [-6, 6]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = frecuencia;
      osc.detune.value = det;
      osc.connect(filtro);
      osc.start(t);
      osc.stop(t + duracion + 0.05);
    }
    filtro.connect(vol).connect(destino);
  }

  // El latido grave: un golpe corto y redondo en cada negra.
  function golpeGrave(frecuencia, t, destino) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(frecuencia, t);
    osc.frequency.exponentialRampToValueAtTime(frecuencia * 0.8, t + 0.18);
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(0, t);
    vol.gain.linearRampToValueAtTime(0.16, t + 0.02);
    vol.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(vol).connect(destino);
    osc.start(t);
    osc.stop(t + 0.55);
  }

  function arrancarMusica() {
    if (!ctx || musica) return;
    const salida = ctx.createGain();
    salida.gain.setValueAtTime(0, ctx.currentTime);
    salida.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 3);
    salida.connect(ctx.destination);

    // Drone de fondo: sierras graves desafinadas por un filtro que
    // respira (un LFO lentísimo) = pad de tensión continuo.
    const droneFiltro = ctx.createBiquadFilter();
    droneFiltro.type = "lowpass";
    droneFiltro.frequency.value = 200;
    droneFiltro.Q.value = 6;
    const droneVol = ctx.createGain();
    droneVol.gain.value = 0.1;
    droneFiltro.connect(droneVol).connect(salida);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 120;
    lfo.connect(lfoGain).connect(droneFiltro.frequency);
    lfo.start();
    const droneOscs = [lfo];
    for (const f of [DRONE_GRAVE, DRONE_GRAVE * 1.5]) {
      for (const det of [-5, 5]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(droneFiltro);
        o.start();
        droneOscs.push(o);
      }
    }

    const m = { salida, paso: 0, proximo: ctx.currentTime + 0.2, timer: null, drone: droneOscs };
    // Planificador con anticipación: agenda las notas que vienen.
    m.timer = setInterval(() => {
      while (m.proximo < ctx.currentTime + 0.5) {
        const i = m.paso % ARPEGIO.length;
        notaMusica(ARPEGIO[i], m.proximo, PASO_MUSICA * 1.6, salida);
        if (i % 4 === 0) golpeGrave(PULSO_GRAVE, m.proximo, salida); // latido por negra
        m.paso++;
        m.proximo += PASO_MUSICA;
      }
    }, 120);
    musica = m;
  }

  function pararMusica() {
    if (!musica) return;
    const m = musica;
    musica = null;
    clearInterval(m.timer);
    try {
      m.salida.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.9);
      const fin = ctx.currentTime + 1.0;
      (m.drone || []).forEach((o) => { try { o.stop(fin); } catch {} });
      setTimeout(() => m.salida.disconnect(), 1100);
    } catch {}
  }

  function evaluarMusica() {
    if (activo && musicaDeseada) arrancarMusica();
    else pararMusica();
  }

  function encender() {
    deseo = true;
    activo = true;
    localStorage.setItem("pc-audio", "1");
    asegurarContexto();
    arrancarZumbido();
    evaluarMusica();
  }

  function apagar() {
    deseo = false;
    activo = false;
    localStorage.setItem("pc-audio", "0");
    pararZumbido();
    pararMusica();
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

    // La pantalla actual pide (o no) música de fondo.
    musica(deseada) {
      musicaDeseada = deseada;
      evaluarMusica();
    },

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
