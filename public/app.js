// Cliente de RÍO MANSO: pantallas, conexión y desafíos.
// El servidor es la autoridad; acá solo se muestra estado y se
// envían intenciones (unirse, iniciar, responder, revancha).

const $ = (id) => document.getElementById(id);

const estado = {
  ws: null,
  codigo: null,
  tuId: null,
  avatarElegido: 0,
  fase: "inicio",
  jugadores: {}, // id → { nombre, avatar }
  vivos: [],
  respondi: false,
  soyFantasma: false,
  tengoAyuda: false,
  relojPantalla: null,
  huboError: false,
  tipoActual: null,
  luzVerde: false,
  ordenSiguiente: 1,
  simonEsperando: false,
  simonInput: [],
};

// Tipos de desafío donde una PISTA no tiene sentido (no hay opciones).
const SIN_PISTA = ["orden", "simon", "luzverde"];

// ─── Pantallas ───

function mostrarPantalla(nombre) {
  document.querySelectorAll(".pantalla").forEach((p) => p.classList.remove("activa"));
  $(`pantalla-${nombre}`).classList.add("activa");
  estado.fase = nombre;
  // Música en las pantallas tranquilas; en el desafío manda el reloj.
  Sonido.musica(["inicio", "lobby", "intro", "final"].includes(nombre));
}

function avisar(texto) {
  $("mensaje-inicio").textContent = texto;
}

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function rotacionDe(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 997;
  return `${(h % 9) - 4}deg`;
}

function registrarJugadores(lista) {
  lista.forEach((j) => {
    estado.jugadores[j.id] = j;
  });
}

function nombreDe(id) {
  return estado.jugadores[id]?.nombre || "???";
}

// ─── Avatares ───

function armarGrillaAvatares() {
  const grilla = $("grilla-avatares");
  AVATARES.forEach((av, i) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "avatar" + (i === 0 ? " elegido" : "");
    boton.innerHTML = `<img class="cara" src="${av.img}" alt="${av.nombre}">`;
    boton.onclick = () => {
      estado.avatarElegido = i;
      grilla.querySelectorAll(".avatar").forEach((b) => b.classList.remove("elegido"));
      boton.classList.add("elegido");
    };
    grilla.appendChild(boton);
  });
}

// ─── Conexión ───

function conectar(codigo) {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocolo}://${location.host}/api/sala/${codigo}/ws`);
  estado.ws = ws;
  estado.codigo = codigo;
  estado.huboError = false;

  ws.onopen = () => {
    ws.send(JSON.stringify({
      tipo: "unirse",
      nombre: $("campo-nombre").value.trim(),
      avatar: estado.avatarElegido,
    }));
  };
  ws.onmessage = (e) => manejarMensaje(JSON.parse(e.data));
  ws.onclose = () => {
    if (estado.fase !== "inicio") {
      mostrarPantalla("inicio");
      $("campo-codigo").value = estado.codigo || "";
      avisar("SE CORTÓ LA SEÑAL. TOCÁ «UNIRSE» PARA VOLVER A ENTRAR.");
    } else if (!estado.huboError) {
      avisar("NO SE PUDO CONECTAR. SI TU RED BLOQUEA CONEXIONES, PROBÁ CON DATOS MÓVILES.");
    }
  };
}

function manejarMensaje(msg) {
  switch (msg.tipo) {
    case "bienvenida":
      estado.tuId = msg.tuId;
      break;
    case "lobby":
      registrarJugadores(msg.jugadores);
      dibujarLobby(msg);
      mostrarPantalla("lobby");
      break;
    case "faseCambio":
      manejarFaseCambio(msg);
      break;
    case "desafio":
      mostrarDesafio(msg);
      break;
    case "progreso":
      $("progreso-ronda").textContent = `RESPONDIERON ${msg.respondieron}/${msg.totalVivos}`;
      break;
    case "respuestaRecibida":
      estado.respondi = true;
      $("estado-respuesta").textContent = "RESPUESTA ENVIADA. AGUANTÁ...";
      break;
    case "resolucion":
      mostrarResolucion(msg);
      break;
    case "luzverde":
      activarLuzVerde();
      break;
    case "pista":
      recibirPista(msg);
      break;
    case "escudo":
      recibirEscudo(msg);
      break;
    case "ayudaConfirmada":
      estado.tengoAyuda = false;
      $("panel-fantasma").innerHTML =
        `<p class="aviso-fantasma">DISTE ${msg.accion === "pista" ? "UNA PISTA" : "UN ESCUDO"} A ${escaparHTML((msg.objetivo||"").toUpperCase())}.</p>`;
      break;
    case "reconexion":
      manejarReconexion(msg);
      break;
    case "presencia":
      // (en esta versión no marcamos visualmente la caída en partida)
      break;
    case "error":
      estado.huboError = true;
      mostrarError(msg.mensaje);
      break;
  }
}

function mostrarError(mensaje) {
  if (estado.fase === "inicio") avisar(mensaje);
  else if (estado.fase === "lobby") $("nota-iniciar").textContent = mensaje;
}

function manejarFaseCambio(msg) {
  if (msg.fase === "intro") {
    registrarJugadores(msg.jugadores || []);
    mostrarIntro(msg);
  } else if (msg.fase === "final") {
    mostrarFinal(msg.resultado);
  } else if (msg.fase === "lobby") {
    mostrarPantalla("lobby");
    if (msg.aviso) $("nota-iniciar").textContent = msg.aviso;
  }
}

// ─── Lobby ───

function dibujarLobby(msg) {
  $("codigo-sala").textContent = estado.codigo;
  $("conteo-lobby").textContent = `EN LA CABAÑA: ${msg.jugadores.length}/8`;

  const lista = $("lista-jugadores");
  lista.innerHTML = "";
  msg.jugadores.forEach((j) => {
    const av = AVATARES[j.avatar] || AVATARES[0];
    const item = document.createElement("li");
    item.className = "polaroid";
    item.style.setProperty("--rot", rotacionDe(j.id));
    const esGuia = j.id === msg.creadorId;
    const sosVos = j.id === estado.tuId;
    item.innerHTML = `
      ${esGuia ? '<span class="etiqueta-jefe">ABRIÓ LA CABAÑA</span>' : ""}
      <img class="cara" src="${av.img}" alt="">
      <span class="nombre-mano">${escaparHTML(j.nombre)}${sosVos ? " (vos)" : ""}</span>`;
    lista.appendChild(item);
  });

  const soyGuia = msg.creadorId === estado.tuId;
  const boton = $("boton-iniciar");
  boton.hidden = !soyGuia;
  if (soyGuia) {
    const faltan = msg.minimo - msg.jugadores.length;
    boton.disabled = faltan > 0;
    $("nota-iniciar").textContent =
      faltan > 0
        ? `FALTAN ${faltan} PERSONA${faltan === 1 ? "" : "S"} (MÍNIMO ${msg.minimo}).`
        : "";
  } else {
    $("nota-iniciar").textContent = "ESPERANDO A QUE EMPIECE LA NOCHE...";
  }
}

// ─── Intro narrativa ───

function mostrarIntro(msg) {
  // Arranca una noche nueva: todos vivos, sin fantasmas todavía.
  estado.soyFantasma = false;
  estado.tengoAyuda = false;
  mostrarPantalla("intro");
  const cont = $("intro-texto");
  cont.innerHTML = "";
  const lineas = msg.texto || [];
  // Las líneas aparecen de a una, como si el aparato las imprimiera.
  const intervalo = Math.min(1400, (msg.restanteMs || 6000) / (lineas.length + 1));
  lineas.forEach((linea, i) => {
    setTimeout(() => {
      const p = document.createElement("p");
      p.className = "linea-intro";
      p.textContent = linea;
      cont.appendChild(p);
      Sonido.transmision();
    }, i * intervalo);
  });
}

// ─── Desafío ───

function mostrarDesafio(msg) {
  estado.vivos = msg.vivos || [];
  estado.respondi = false;
  const soyVivo = estado.vivos.includes(estado.tuId);

  $("marcador-ronda").textContent = `RONDA ${msg.ronda}/${msg.total}`;
  $("marcador-vivos").textContent = `◊ ${estado.vivos.length}`;
  $("enunciado-desafio").textContent = msg.enunciado;
  $("progreso-ronda").textContent = "";
  $("estado-respuesta").textContent = soyVivo
    ? "" : "EL RÍO YA TE LLEVÓ. MIRÁ SI EL RESTO SOBREVIVE...";
  $("monitor-desafio").classList.remove("protegido");
  estado.tipoActual = msg.tipoDesafio;

  dibujarDesafio(msg.tipoDesafio, msg.datos, soyVivo);
  dibujarPanelFantasma(soyVivo, msg.tipoDesafio);
  iniciarReloj(msg.restanteMs, "reloj");
  mostrarPantalla("ronda");
}

// Panel del fantasma: si caíste y todavía tenés tu ayuda, podés
// gastarla en alguien que sigue vivo (una pista o un escudo).
function dibujarPanelFantasma(soyVivo, tipo) {
  const panel = $("panel-fantasma");
  panel.innerHTML = "";
  panel.hidden = soyVivo || !estado.tengoAyuda;
  if (panel.hidden) return;

  const dejaPista = !SIN_PISTA.includes(tipo);
  const titulo = document.createElement("p");
  titulo.className = "aviso-fantasma";
  titulo.textContent = "TENÉS UNA AYUDA. ELEGÍ A QUIÉN AUXILIAR:";
  panel.appendChild(titulo);

  estado.vivos.forEach((id) => {
    const fila = document.createElement("div");
    fila.className = "fila-fantasma";
    const nombre = document.createElement("span");
    nombre.className = "nombre-vivo";
    nombre.textContent = nombreDe(id);
    fila.append(nombre);
    if (dejaPista) {
      const bPista = document.createElement("button");
      bPista.className = "ayuda-btn";
      bPista.textContent = "PISTA";
      bPista.onclick = () => darAyuda(id, "pista");
      fila.append(bPista);
    }
    const bEscudo = document.createElement("button");
    bEscudo.className = "ayuda-btn";
    bEscudo.textContent = "ESCUDO";
    bEscudo.onclick = () => darAyuda(id, "escudo");
    fila.append(bEscudo);
    panel.appendChild(fila);
  });
}

function darAyuda(objetivoId, accion) {
  if (!estado.tengoAyuda) return;
  estado.ws.send(JSON.stringify({ tipo: "ayuda", accion, objetivoId }));
}

// Un fantasma te tachó las opciones malas (te dejó pocas).
function recibirPista(msg) {
  const visibles = new Set(msg.visibles);
  document.querySelectorAll("#zona-desafio .opcion").forEach((b) => {
    // el id de la opción quedó guardado en el handler; lo recuperamos
    // comparando por el dataset que seteamos al dibujar.
    if (!visibles.has(b.dataset.id)) b.classList.add("tachada");
  });
  $("estado-respuesta").textContent = `${(msg.de||"UN FANTASMA").toUpperCase()} TE SUSURRA UNA PISTA`;
}

function recibirEscudo(msg) {
  $("estado-respuesta").textContent = `${(msg.de||"UN FANTASMA").toUpperCase()} TE PROTEGE ESTA RONDA`;
  $("monitor-desafio").classList.add("protegido");
}

// Cada tipo de desafío se dibuja distinto. Sumar uno = agregar un caso.
function dibujarDesafio(tipo, datos, soyVivo) {
  const zona = $("zona-desafio");
  zona.innerHTML = "";

  // "En orden" (Schulte): grilla de números a tocar en secuencia.
  if (tipo === "orden") {
    estado.ordenSiguiente = 1;
    const grilla = document.createElement("div");
    grilla.className = "celdas-distinto";
    grilla.style.gridTemplateColumns = `repeat(${datos.cols}, 1fr)`;
    datos.celdas.forEach((c) => {
      const b = document.createElement("button");
      b.className = "opcion celda celda-num";
      b.textContent = c.n;
      b.dataset.n = c.n;
      b.disabled = !soyVivo;
      b.onclick = () => tocarOrden(b, datos.total);
      grilla.appendChild(b);
    });
    zona.appendChild(grilla);
    if (soyVivo) $("estado-respuesta").textContent = "TOCÁ EL 1 PARA EMPEZAR";
    return;
  }

  // "Simon": memorizá la secuencia de luces y repetila.
  if (tipo === "simon") {
    estado.simonEsperando = true;
    estado.simonInput = [];
    const cont = document.createElement("div");
    cont.className = "simon-pads";
    for (let i = 0; i < datos.pads; i++) {
      const p = document.createElement("button");
      p.className = "simon-pad pad-" + i;
      p.dataset.i = i;
      p.disabled = true;
      p.onclick = () => tocarSimon(i, datos.secuencia);
      cont.appendChild(p);
    }
    zona.appendChild(cont);
    if (soyVivo) reproducirSimon(datos.secuencia, datos.mostrarMs);
    return;
  }

  // "Luz verde" es una zona de toque, no una grilla de opciones.
  if (tipo === "luzverde") {
    estado.luzVerde = false;
    const z = document.createElement("button");
    z.className = "luzverde-zona esperando";
    z.id = "luzverde-zona";
    z.textContent = "ESPERÁ...";
    z.disabled = !soyVivo;
    z.onclick = responderLuz;
    zona.appendChild(z);
    return;
  }

  // La pieza grande de arriba cambia según el desafío.
  if (tipo === "stroop") {
    const palabra = document.createElement("div");
    palabra.className = "palabra-stroop";
    palabra.style.color = datos.tinta;
    palabra.textContent = datos.palabra;
    zona.appendChild(palabra);
  } else if (tipo === "calculo") {
    const exp = document.createElement("div");
    exp.className = "expresion-desafio";
    exp.textContent = `${datos.expresion} = ?`;
    zona.appendChild(exp);
  } else if (tipo === "patron") {
    const sec = document.createElement("div");
    sec.className = "secuencia-desafio";
    sec.textContent = datos.secuencia;
    zona.appendChild(sec);
  } else if (tipo === "cuantos") {
    const grid = document.createElement("div");
    grid.className = "figuras-grid";
    datos.figuras.forEach((ch) => {
      const s = document.createElement("span");
      s.className = "figura";
      s.textContent = ch;
      grid.appendChild(s);
    });
    zona.appendChild(grid);
  } else if (tipo === "figurafalta") {
    const sec = document.createElement("div");
    sec.className = "secuencia-visual";
    sec.textContent = datos.secuencia.join("   ");
    zona.appendChild(sec);
  } else if (tipo === "igualdistinto") {
    const f1 = document.createElement("div");
    f1.className = "fila-comparar";
    f1.textContent = datos.fila1.join("  ");
    const f2 = document.createElement("div");
    f2.className = "fila-comparar";
    f2.textContent = datos.fila2.join("  ");
    zona.append(f1, f2);
  }

  // Las opciones: botones de texto, o celdas visuales (distinto).
  if (tipo === "distinto") {
    const grilla = document.createElement("div");
    grilla.className = "celdas-distinto";
    grilla.style.gridTemplateColumns = `repeat(${datos.cols}, 1fr)`;
    datos.opciones.forEach((op) => {
      const b = document.createElement("button");
      b.className = "opcion celda";
      b.dataset.id = op.id;
      b.innerHTML = `<span style="display:inline-block;transform:rotate(${op.rot}deg)">${op.char}</span>`;
      b.disabled = !soyVivo;
      b.onclick = () => responder(op.id, b);
      grilla.appendChild(b);
    });
    zona.appendChild(grilla);
    return;
  }

  const grilla = document.createElement("div");
  grilla.className = "opciones-desafio" +
    (tipo === "intruso" ? " intruso" : "") +
    (tipo === "figurafalta" ? " figuras" : "");
  datos.opciones.forEach((op) => {
    const b = document.createElement("button");
    b.className = "opcion";
    b.dataset.id = op.id; // lo usa la pista para tachar las malas
    b.textContent = op.nombre;
    b.disabled = !soyVivo;
    b.onclick = () => responder(op.id, b);
    grilla.appendChild(b);
  });
  zona.appendChild(grilla);
}

// "Luz verde": la señal llegó. Si todavía no, tocar es adelantarse.
function activarLuzVerde() {
  if (estado.fase !== "ronda") return;
  estado.luzVerde = true;
  const z = $("luzverde-zona");
  if (!z) return;
  z.classList.remove("esperando");
  z.classList.add("ya");
  z.textContent = "¡YA! TOCÁ";
}

function responderLuz() {
  if (estado.respondi) return;
  estado.respondi = true;
  estado.ws.send(JSON.stringify({ tipo: "responder", valor: "tap" }));
  const z = $("luzverde-zona");
  if (z) {
    z.disabled = true;
    z.textContent = estado.luzVerde ? "¡TOCASTE!" : "TE ADELANTASTE...";
    z.classList.toggle("fallo", !estado.luzVerde);
  }
}

// "En orden": solo avanza si tocás el número que toca. Al completar, listo.
function tocarOrden(boton, total) {
  if (estado.respondi) return;
  if (Number(boton.dataset.n) !== estado.ordenSiguiente) return;
  boton.classList.add("hecha");
  boton.disabled = true;
  estado.ordenSiguiente++;
  if (estado.ordenSiguiente > total) {
    estado.respondi = true;
    estado.ws.send(JSON.stringify({ tipo: "responder", valor: "ok" }));
    $("estado-respuesta").textContent = "¡COMPLETO! AGUANTÁ...";
  } else {
    $("estado-respuesta").textContent = `VA EL ${estado.ordenSiguiente}`;
  }
}

// "Simon": primero se enciende la secuencia; después la repetís.
function flashPad(i) {
  const p = document.querySelector(".simon-pad.pad-" + i);
  if (!p) return;
  p.classList.add("encendido");
  setTimeout(() => p.classList.remove("encendido"), 350);
}

function reproducirSimon(secuencia, mostrarMs) {
  $("estado-respuesta").textContent = "MEMORIZÁ...";
  const paso = mostrarMs / (secuencia.length + 1);
  secuencia.forEach((idx, k) => setTimeout(() => flashPad(idx), k * paso + 300));
  setTimeout(() => {
    estado.simonEsperando = false;
    document.querySelectorAll(".simon-pad").forEach((p) => (p.disabled = false));
    $("estado-respuesta").textContent = "AHORA REPETÍ";
  }, secuencia.length * paso + 400);
}

function tocarSimon(i, secuencia) {
  if (estado.respondi || estado.simonEsperando) return;
  flashPad(i);
  estado.simonInput.push(i);
  const paso = estado.simonInput.length - 1;
  if (secuencia[paso] !== i) {
    estado.respondi = true;
    estado.ws.send(JSON.stringify({ tipo: "responder", valor: "fail" }));
    $("estado-respuesta").textContent = "TE EQUIVOCASTE...";
    document.querySelectorAll(".simon-pad").forEach((p) => (p.disabled = true));
    return;
  }
  if (estado.simonInput.length === secuencia.length) {
    estado.respondi = true;
    estado.ws.send(JSON.stringify({ tipo: "responder", valor: "ok" }));
    $("estado-respuesta").textContent = "¡BIEN! AGUANTÁ...";
    document.querySelectorAll(".simon-pad").forEach((p) => (p.disabled = true));
  }
}

function responder(valor, boton) {
  if (estado.respondi) return;
  estado.respondi = true;
  estado.ws.send(JSON.stringify({ tipo: "responder", valor }));
  // Bloquea todas las opciones y marca la elegida.
  document.querySelectorAll("#zona-desafio .opcion").forEach((b) => (b.disabled = true));
  if (boton) boton.classList.add("elegida");
  $("estado-respuesta").textContent = "RESPUESTA ENVIADA. AGUANTÁ...";
}

// ─── Resolución ───

function mostrarResolucion(msg) {
  const sigoVivo = msg.vivos.includes(estado.tuId);
  const eraVivo = msg.resultados.some((r) => r.id === estado.tuId);
  // Si estaba vivo y ya no, me vuelvo fantasma con una ayuda para gastar.
  if (eraVivo && !sigoVivo) {
    estado.soyFantasma = true;
    estado.tengoAyuda = true;
  }
  const miResultado = msg.resultados.find((r) => r.id === estado.tuId);

  $("titulo-resolucion").textContent = miResultado?.escudado
    ? ":: UN ESCUDO TE SALVÓ ::"
    : sigoVivo
      ? ":: SEGUÍS EN PIE ::"
      : eraVivo
        ? ":: EL RÍO TE LLEVÓ ::"
        : ":: LA NOCHE SIGUE ::";
  $("titulo-resolucion").style.color = sigoVivo || !eraVivo ? "#33ff66" : "#ff5040";

  const det = $("detalle-resolucion");
  // En "luz verde" no hay respuesta correcta que mostrar (es reacción).
  det.innerHTML = msg.correcta != null
    ? `<p class="dato-resolucion">LA RESPUESTA ERA: ${String(msg.correcta).toUpperCase()}</p>`
    : `<p class="dato-resolucion">REFLEJOS BAJO PRESIÓN</p>`;

  // La imagen del desaparecido aparece solo si el Río se llevó a alguien.
  $("img-desaparecido").hidden = msg.desaparecidos.length === 0;

  const cont = $("desaparecidos-lista");
  cont.innerHTML = "";
  if (msg.desaparecidos.length === 0) {
    const p = document.createElement("p");
    p.className = "subtitulo-fosforo";
    p.textContent = "NADIE CAYÓ ESTA RONDA.";
    cont.appendChild(p);
  } else {
    msg.desaparecidos.forEach((d) => {
      const p = document.createElement("p");
      p.className = "desaparecido";
      p.textContent = `EL RÍO MANSO SE LLEVÓ A ${d.nombre.toUpperCase()}`;
      cont.appendChild(p);
    });
  }
  // La voz del Río, en cursiva ámbar, cerrando la ronda.
  if (msg.susurro) {
    const s = document.createElement("p");
    s.className = "susurro-rio";
    s.textContent = `“${msg.susurro}”`;
    cont.appendChild(s);
  }

  if (eraVivo) {
    if (sigoVivo) Sonido.transmision();
    else { Sonido.derrota(); if (navigator.vibrate) navigator.vibrate(250); }
  }

  mostrarPantalla("resolucion");
}

// ─── Final ───

function mostrarFinal(resultado) {
  $("titulo-final").textContent = resultado.ganaron
    ? ":: LLEGÓ EL AMANECER ::"
    : ":: SILENCIO EN EL RÍO ::";
  $("titulo-final").style.color = resultado.ganaron ? "#33ff66" : "#ff5040";
  $("titulo-final").style.textShadow = resultado.ganaron
    ? "0 0 10px rgba(51,255,102,0.6)"
    : "0 0 10px rgba(255,80,64,0.6)";

  $("detalle-final").textContent = resultado.ganaron
    ? "ALGUIEN SOBREVIVIÓ A LA NOCHE. EL GRUPO GANA."
    : "EL RÍO MANSO SE LOS LLEVÓ A TODOS.";

  // El amanecer si ganaron; la cabaña vacía si el Río se los llevó.
  const imgFinal = $("img-final");
  imgFinal.src = resultado.ganaron ? "img/amanecer.jpg" : "img/cabana-vacia.jpg";
  imgFinal.hidden = false;

  const cont = $("sobrevivientes-lista");
  cont.innerHTML = "";
  if (resultado.sobrevivientes.length) {
    const titulo = document.createElement("p");
    titulo.className = "subtitulo-fosforo";
    titulo.textContent = "SOBREVIVIENTES";
    cont.appendChild(titulo);
    const fila = document.createElement("div");
    fila.className = "fila-sobrevivientes";
    resultado.sobrevivientes.forEach((s) => {
      const av = AVATARES[s.avatar] || AVATARES[0];
      const pol = document.createElement("div");
      pol.className = "polaroid";
      pol.style.setProperty("--rot", rotacionDe(s.id));
      pol.innerHTML = `<img class="cara" src="${av.img}" alt="">
        <span class="nombre-mano">${escaparHTML(s.nombre)}</span>`;
      fila.appendChild(pol);
    });
    cont.appendChild(fila);
  }

  if (resultado.ganaron) Sonido.exito();
  else Sonido.derrota();
  if (navigator.vibrate) navigator.vibrate(resultado.ganaron ? [80, 60, 80] : [250]);

  mostrarPantalla("final");
}

// ─── Reconexión ───

function manejarReconexion(msg) {
  registrarJugadores(msg.jugadores || []);
  estado.vivos = msg.vivos || [];
  estado.soyFantasma = !msg.soyVivo;
  estado.tengoAyuda = Boolean(msg.tengoAyuda);
  if (msg.fase === "ronda" && msg.desafio) {
    estado.respondi = msg.yaRespondi;
    $("marcador-ronda").textContent = `RONDA ${msg.ronda}/${msg.total}`;
    $("marcador-vivos").textContent = `◊ ${estado.vivos.length}`;
    $("enunciado-desafio").textContent = msg.desafio.enunciado;
    $("monitor-desafio").classList.remove("protegido");
    estado.tipoActual = msg.desafio.tipo;
    const soyVivo = msg.soyVivo;
    dibujarDesafio(msg.desafio.tipo, msg.desafio.datos, soyVivo && !msg.yaRespondi);
    dibujarPanelFantasma(soyVivo, msg.desafio.tipo);
    if (msg.desafio.tipo === "luzverde" && msg.yaVerde) activarLuzVerde();
    if (msg.yaRespondi) {
      document.querySelectorAll("#zona-desafio .opcion").forEach((b) => (b.disabled = true));
      $("estado-respuesta").textContent = "YA RESPONDISTE. AGUANTÁ...";
    } else {
      $("estado-respuesta").textContent = soyVivo ? "" : "EL RÍO YA TE LLEVÓ. MIRÁ NOMÁS.";
    }
    iniciarReloj(msg.restanteMs, "reloj");
    mostrarPantalla("ronda");
  } else {
    // intro o resolución: esperá al próximo mensaje del servidor.
    mostrarPantalla("intro");
    $("intro-texto").innerHTML = '<p class="linea-intro">RECONECTANDO CON LA CABAÑA...</p>';
  }
}

// ─── Reloj ───

function iniciarReloj(restanteMs, elementoId) {
  const objetivo = Date.now() + restanteMs;
  if (estado.relojPantalla) clearInterval(estado.relojPantalla);
  let previo = null;
  const pintar = () => {
    const restante = Math.max(0, objetivo - Date.now());
    const seg = Math.ceil(restante / 1000);
    const mm = String(Math.floor(seg / 60)).padStart(2, "0");
    const ss = String(seg % 60).padStart(2, "0");
    const el = $(elementoId);
    if (el) el.textContent = `${mm}:${ss}`;
    if (el && elementoId === "reloj") {
      el.classList.toggle("critico", seg <= 3 && restante > 0);
      if (seg <= 3 && restante > 0 && seg !== previo) Sonido.alarma(seg);
    }
    previo = seg;
    if (restante <= 0) clearInterval(estado.relojPantalla);
  };
  pintar();
  estado.relojPantalla = setInterval(pintar, 200);
}

// ─── Acciones de inicio ───

function validarNombre() {
  const nombre = $("campo-nombre").value.trim();
  if (!nombre) {
    avisar("ESCRIBÍ TU NOMBRE PARA ENTRAR.");
    return null;
  }
  return nombre;
}

$("boton-crear").onclick = async () => {
  if (!validarNombre()) return;
  avisar("ABRIENDO LA CABAÑA...");
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), 10000);
  try {
    const r = await fetch("/api/crear", { method: "POST", signal: control.signal });
    const datos = await r.json();
    if (!r.ok) {
      avisar(datos.error || "NO SE PUDO ABRIR. PROBÁ DE NUEVO.");
      return;
    }
    avisar("");
    conectar(datos.codigo);
  } catch (e) {
    avisar(
      e.name === "AbortError"
        ? "LA CABAÑA NO RESPONDE. TU RED PUEDE ESTAR BLOQUEANDO: PROBÁ CON DATOS MÓVILES."
        : "SIN CONEXIÓN. REVISÁ TU INTERNET."
    );
  } finally {
    clearTimeout(t);
  }
};

$("boton-unirse").onclick = () => {
  if (!validarNombre()) return;
  const codigo = $("campo-codigo").value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(codigo)) {
    avisar("EL CÓDIGO SON 4 LETRAS.");
    return;
  }
  avisar("");
  conectar(codigo);
};

$("boton-iniciar").onclick = () => estado.ws.send(JSON.stringify({ tipo: "iniciar" }));
$("boton-revancha").onclick = () => estado.ws.send(JSON.stringify({ tipo: "revancha" }));

armarGrillaAvatares();

// ─── El aparato: encendido, audio, manual, clicks ───

if (!sessionStorage.getItem("pc-encendido")) {
  sessionStorage.setItem("pc-encendido", "1");
  const enc = $("encendido");
  enc.hidden = false;
  setTimeout(() => enc.remove(), 1300);
} else {
  $("encendido").remove();
}

function actualizarPerilla(encendido) {
  $("perilla-audio").classList.toggle("activa", encendido);
  $("etiqueta-audio").textContent = `AUDIO: ${encendido ? "ON" : "OFF"}`;
}
$("perilla-audio").onclick = () => {
  const on = Sonido.alternar();
  actualizarPerilla(on);
  if (on) Sonido.encendidoCRT();
};
actualizarPerilla(Sonido.quiereAudio());
Sonido.musica(true);

$("boton-instrucciones").onclick = () => ($("overlay-instrucciones").hidden = false);
$("boton-cerrar-instrucciones").onclick = () => ($("overlay-instrucciones").hidden = true);

document.addEventListener("pointerdown", (e) => {
  if (e.target.closest("button")) Sonido.click();
});
