// Lógica del cliente: pantallas, conexión y juego.
// El servidor es la autoridad; acá solo se muestra estado
// y se envían intenciones.

const $ = (id) => document.getElementById(id);

const estado = {
  ws: null,
  codigo: null,
  tuId: null,
  avatarElegido: 0,
  fase: "inicio",
  jugadores: {}, // id → { nombre, avatar, color }
  vivos: {}, // id → texto que está tecleando ahora
  miRol: null,
  contactadoId: null,
  soyCreador: false,
  relojTecleo: null,
  relojPantalla: null,
};

const ROLES = {
  investigador: {
    titulo: "INVESTIGADOR",
    descripcion:
      "NO CONOCÉS LA PALABRA. INTERROGÁ AL CONTACTADO POR LA TERMINAL " +
      "Y DESCIFRALA ANTES DE QUE SE PIERDA LA SEÑAL. DESCONFIÁ: HAY UN " +
      "METAMORFO ENTRE USTEDES.",
  },
  contactado: {
    titulo: "CONTACTADO",
    descripcion:
      "CONOCÉS LA PALABRA, PERO NO TENÉS TECLADO. RESPONDÉ A LAS " +
      "PREGUNTAS DE LA TERMINAL SOLO CON TUS 5 BOTONES.",
  },
  metamorfo: {
    titulo: "METAMORFO",
    descripcion:
      "CONOCÉS LA PALABRA. FINGÍ SER UN INVESTIGADOR Y QUEMÁ EL RELOJ " +
      "CON PREGUNTAS INÚTILES. CUIDADO: TODOS VEN LO QUE TECLEÁS. " +
      "JAMÁS ESCRIBAS LA PALABRA, NI EN BORRADOR.",
  },
};

// ─── Pantallas ───

function mostrarPantalla(nombre) {
  document.querySelectorAll(".pantalla").forEach((p) =>
    p.classList.remove("activa")
  );
  $(`pantalla-${nombre}`).classList.add("activa");
  estado.fase = nombre;
  // Música de fondo en las pantallas tranquilas; en la partida,
  // la tensión la ponen la terminal y la alarma.
  Sonido.musica(["inicio", "lobby", "final"].includes(nombre));
}

function avisar(texto) {
  $("mensaje-inicio").textContent = texto;
}

// ─── Selección de avatar ───

function armarGrillaAvatares() {
  const grilla = $("grilla-avatares");
  AVATARES.forEach((av, i) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "avatar" + (i === 0 ? " elegido" : "");
    boton.innerHTML = `<img class="cara" src="${av.img}" alt="${av.nombre}">`;
    boton.onclick = () => {
      estado.avatarElegido = i;
      grilla.querySelectorAll(".avatar").forEach((b) =>
        b.classList.remove("elegido")
      );
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

  ws.onmessage = (evento) => manejarMensaje(JSON.parse(evento.data));

  ws.onclose = () => {
    if (estado.fase !== "inicio") {
      // Se cayó la conexión a mitad de juego: dejar el código listo
      // para que reconectar sea un solo botón.
      mostrarPantalla("inicio");
      $("campo-codigo").value = estado.codigo || "";
      avisar("SEÑAL PERDIDA. TOCÁ «UNIRSE A SALA» PARA RECUPERAR TU PUESTO.");
    } else if (!estado.huboError) {
      // La conexión en vivo nunca se estableció (típico de redes
      // corporativas que bloquean WebSockets).
      avisar(
        "NO SE PUDO ESTABLECER LA SEÑAL. SI TU RED BLOQUEA CONEXIONES " +
        "(OFICINAS, ESCUELAS), PROBÁ CON DATOS MÓVILES."
      );
    }
  };
}

function manejarMensaje(msg) {
  switch (msg.tipo) {
    case "bienvenida":
      estado.tuId = msg.tuId;
      break;

    case "lobby":
      mostrarPantalla("lobby");
      dibujarLobby(msg);
      break;

    case "rol":
      registrarJugadores(msg.jugadores);
      estado.miRol = msg.rol;
      estado.contactadoId = msg.contactadoId;
      dibujarRevelacion(msg);
      mostrarPantalla("revelacion");
      break;

    case "reconexion":
      manejarReconexion(msg);
      break;

    case "presencia":
      marcarPresencia(msg.jugadorId, msg.conectado);
      break;

    case "confirmados":
      $("conteo-confirmados").textContent =
        `CONFIRMADOS: ${msg.cantidad}/${msg.total}`;
      break;

    case "faseCambio":
      manejarFaseCambio(msg);
      break;

    case "tecleo":
      if (msg.texto) {
        estado.vivos[msg.jugadorId] = msg.texto;
        // tecleo ajeno: tictac suave, como un teletipo lejano
        const ahora = Date.now();
        if (ahora - (estado.ultimoTic || 0) > 90) {
          estado.ultimoTic = ahora;
          Sonido.tecla();
        }
      } else {
        delete estado.vivos[msg.jugadorId];
      }
      dibujarLineasVivas();
      break;

    case "mensaje":
      delete estado.vivos[msg.jugadorId];
      dibujarLineasVivas();
      agregarAlHistorial(msg);
      break;

    case "sistema":
      agregarLineaSistema(msg.texto);
      break;

    case "glitch":
      mostrarGlitch(msg.jugadorId);
      break;

    case "interferencia":
      sufrirInterferencia(msg.duracionMs);
      break;

    case "reinicioEstado":
      $("nota-emergencia").textContent =
        msg.presionados > 0
          ? `REINICIO: ${msg.presionados}/${msg.total} — FALTAN ${msg.total - msg.presionados}`
          : "";
      break;

    case "emergenciaConfirmada":
      bloquearEmergencia(msg.accion);
      break;

    case "palabraNueva":
      mostrarPalabraNueva(msg.palabra);
      break;

    case "votoRegistrado":
      $("estado-votos").textContent = "VOTO REGISTRADO. ESPERANDO AL RESTO...";
      break;

    case "votos":
      $("estado-votos").textContent =
        `VOTOS EMITIDOS: ${msg.cantidad}/${msg.total}` +
        (yaVote() ? " — TU VOTO ESTÁ SELLADO." : "");
      break;

    case "reloj":
      iniciarReloj(msg.restanteMs, "reloj");
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
  else if (estado.fase === "juicio") $("estado-votos").textContent = mensaje;
  else if (estado.fase === "partida") $("nota-emergencia").textContent = mensaje;
}

function manejarFaseCambio(msg) {
  if (msg.fase === "partida") {
    if (msg.jugadores) {
      registrarJugadores(msg.jugadores);
      estado.listaJugadores = msg.jugadores;
    }
    estado.contactadoId = msg.contactadoId;
    prepararPartida();
    iniciarReloj(msg.restanteMs, "reloj");
    mostrarPantalla("partida");
  } else if (msg.fase === "juicio") {
    estado.contactadoId = msg.contactadoId;
    dibujarJuicio();
    iniciarReloj(msg.restanteMs, "reloj-juicio");
    mostrarPantalla("juicio");
  } else if (msg.fase === "final") {
    dibujarFinal(msg.resultado);
    mostrarPantalla("final");
  } else if (msg.fase === "lobby") {
    // Revancha o partida anulada: el lobby actualizado llega después.
    mostrarPantalla("lobby");
    if (msg.aviso) $("nota-iniciar").textContent = msg.aviso;
  }
}

// ─── Reconexión: el operador caído recupera su puesto ───

function manejarReconexion(msg) {
  estado.miRol = msg.rol;
  estado.contactadoId = msg.contactadoId;
  registrarJugadores(msg.jugadores);
  estado.listaJugadores = msg.jugadores;

  if (msg.fase === "revelacion") {
    dibujarRevelacion(msg);
    mostrarPantalla("revelacion");
    return;
  }

  if (msg.fase === "partida") {
    prepararPartida();
    (msg.historial || []).forEach((linea) => {
      if (linea.tipo === "sistema") agregarLineaSistema(linea.texto, true);
      else agregarAlHistorial(linea);
    });
    if (msg.emergenciaAgotada) bloquearEmergencia("");
    (msg.desconectados || []).forEach((id) => marcarPresencia(id, false));
    iniciarReloj(msg.restanteMs, "reloj");
    mostrarPantalla("partida");
    return;
  }

  if (msg.fase === "juicio") {
    dibujarJuicio();
    if (msg.yaVotaste) {
      votoEmitido = true;
      $("lista-sospechosos").querySelectorAll("button").forEach((b) => (b.disabled = true));
      $("estado-votos").textContent = "TU VOTO YA ESTÁ SELLADO.";
    }
    iniciarReloj(msg.restanteMs, "reloj-juicio");
    mostrarPantalla("juicio");
  }
}

function marcarPresencia(jugadorId, conectado) {
  const ficha = $(`ficha-${jugadorId}`);
  if (ficha) ficha.classList.toggle("caida", !conectado);
}

// ─── Lobby ───

function dibujarLobby(msg) {
  $("codigo-sala").textContent = estado.codigo;
  $("conteo-lobby").textContent = `OPERADORES EN LÍNEA: ${msg.jugadores.length}/8`;

  registrarJugadores(msg.jugadores);

  const lista = $("lista-jugadores");
  lista.innerHTML = "";
  msg.jugadores.forEach((j) => {
    const av = AVATARES[j.avatar] || AVATARES[0];
    const item = document.createElement("li");
    item.className = "polaroid";
    item.style.setProperty("--rot", rotacionDe(j.id));
    const esJefe = j.id === msg.creadorId;
    const sosVos = j.id === estado.tuId;
    item.innerHTML = `
      ${esJefe ? '<span class="etiqueta-jefe">JEFE DE ESTACIÓN</span>' : ""}
      <img class="cara" src="${av.img}" alt="">
      <span class="nombre-mano">${escaparHTML(j.nombre)}${sosVos ? " (vos)" : ""}</span>`;
    lista.appendChild(item);
  });

  estado.soyCreador = msg.creadorId === estado.tuId;

  // Selector de dificultad: solo el jefe puede tocarlo.
  document.querySelectorAll("#selector-dificultad button").forEach((b) => {
    b.classList.toggle("elegido", b.dataset.dif === msg.dificultad);
    b.disabled = !estado.soyCreador;
  });

  const boton = $("boton-iniciar");
  boton.hidden = !estado.soyCreador;
  if (estado.soyCreador) {
    const faltan = 4 - msg.jugadores.length;
    boton.disabled = faltan > 0;
    $("nota-iniciar").textContent =
      faltan > 0
        ? `FALTAN ${faltan} OPERADOR${faltan === 1 ? "" : "ES"} PARA INICIAR.`
        : "";
  } else {
    $("nota-iniciar").textContent = "ESPERANDO AL JEFE DE ESTACIÓN...";
  }
}

function escaparHTML(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// Rotación fija de la polaroid de cada jugador, derivada de su id:
// la misma foto torcida igual en todas las pantallas, toda la partida.
function rotacionDe(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 997;
  return `${(h % 9) - 4}deg`;
}

// ─── Revelación de rol ───

function dibujarRevelacion(msg) {
  const rol = ROLES[msg.rol];
  $("rol-titulo").textContent = rol.titulo;
  $("rol-descripcion").textContent = rol.descripcion;
  $("rol-palabra").hidden = !msg.palabra;
  if (msg.palabra) {
    $("palabra-secreta").textContent = msg.palabra.toUpperCase();
  }
  // El Metamorfo se ve a sí mismo: la única pantalla donde aparece el alien.
  $("alien-revelacion").hidden = msg.rol !== "metamorfo";
  const boton = $("boton-entendido");
  boton.disabled = false;
  $("conteo-confirmados").textContent = "";
}

$("boton-entendido").onclick = () => {
  estado.ws.send(JSON.stringify({ tipo: "entendido" }));
  $("boton-entendido").disabled = true;
};

// ─── El reloj ───

function iniciarReloj(restanteMs, elementoId) {
  const objetivo = Date.now() + restanteMs;
  if (estado.relojPantalla) clearInterval(estado.relojPantalla);

  let segundosPrevios = null;
  const pintar = () => {
    const restante = Math.max(0, objetivo - Date.now());
    const segundos = Math.ceil(restante / 1000);
    const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
    const ss = String(segundos % 60).padStart(2, "0");
    const elemento = $(elementoId);
    if (elemento) elemento.textContent = `${mm}:${ss}`;

    // Los últimos 30 segundos: el display titila y la alarma crece.
    if (elementoId === "reloj" && elemento) {
      elemento.classList.toggle("critico", segundos <= 30 && segundos > 0);
      if (segundos <= 30 && segundos > 0 && segundos !== segundosPrevios) {
        Sonido.alarma(segundos);
        if (segundos <= 10 && navigator.vibrate) navigator.vibrate(40);
      }
    }
    segundosPrevios = segundos;

    if (restante <= 0) clearInterval(estado.relojPantalla);
  };
  pintar();
  estado.relojPantalla = setInterval(pintar, 250);
}

// ─── La Terminal ───

function registrarJugadores(lista) {
  lista.forEach((j) => {
    estado.jugadores[j.id] = j;
  });
}

function colorDe(jugadorId) {
  const j = estado.jugadores[jugadorId];
  return COLORES[j ? j.color : 0];
}

function nombreDe(jugadorId) {
  const j = estado.jugadores[jugadorId];
  return j ? j.nombre : "???";
}

function prepararPartida() {
  estado.vivos = {};
  $("historial").innerHTML = "";
  $("lineas-vivas").innerHTML = "";
  $("campo-mensaje").value = "";
  dibujarAvatares();

  // La máquina recuerda el protocolo al abrir el canal.
  const arranque = [
    "CANAL ABIERTO. LA SEÑAL ES LIMITADA.",
    estado.miRol === "contactado"
      ? "RESPONDÉ A LAS PREGUNTAS SOLO CON TUS CONTROLES."
      : "INTERROGUEN AL CONTACTADO: PREGUNTAS DE SÍ O NO.",
    "ADVERTENCIA: HAY UN METAMORFO ENTRE USTEDES.",
  ];
  arranque.forEach((texto) => {
    const linea = document.createElement("div");
    linea.className = "linea-arranque";
    linea.textContent = `· ${texto}`;
    $("historial").appendChild(linea);
  });

  // El botón EMERGENCIA arranca cargado en cada partida.
  const emergencia = $("boton-emergencia");
  emergencia.disabled = false;
  emergencia.classList.remove("agotado");
  $("nota-emergencia").textContent = "";
  $("nota-contactado").textContent = "";

  // El Contactado no tiene teclado: ve sus 5 botones de respuesta.
  const soyContactado = estado.miRol === "contactado";
  $("form-mensaje").hidden = soyContactado;
  $("panel-contactado").hidden = !soyContactado;
  document.querySelectorAll("#botones-respuesta button").forEach((b) => {
    b.disabled = false;
  });

  // El tecleo se transmite agrupado cada ~100 ms (no tecla por tecla),
  // pero en pantalla se siente en vivo, borrones incluidos.
  let ultimoEnviado = "";
  if (estado.relojTecleo) clearInterval(estado.relojTecleo);
  estado.relojTecleo = setInterval(() => {
    if (estado.fase !== "partida" || soyContactado) return;
    const texto = $("campo-mensaje").value;
    if (texto !== ultimoEnviado) {
      ultimoEnviado = texto;
      estado.ws.send(JSON.stringify({ tipo: "tecleo", texto }));
    }
  }, 100);
}

function agregarAlHistorial(msg) {
  const linea = document.createElement("div");
  linea.className = "linea-historial";
  const nombre = document.createElement("span");
  nombre.style.color = COLORES[msg.color] || COLORES[0];
  nombre.textContent = `${msg.nombre}> `;
  const texto = document.createElement("span");
  texto.textContent = msg.texto;
  linea.append(nombre, texto);
  $("historial").appendChild(linea);

  const term = $("terminal");
  term.scrollTop = term.scrollHeight;
}

function agregarLineaSistema(texto, silencioso = false) {
  const linea = document.createElement("div");
  linea.className = "linea-sistema";
  linea.textContent = `*** ${texto} ***`;
  $("historial").appendChild(linea);

  // Tono de transmisión + vibración (donde el dispositivo lo soporte).
  // En la reposición del historial tras reconectar, todo va en silencio.
  if (!silencioso) {
    Sonido.transmision();
    if (navigator.vibrate) navigator.vibrate(80);
  }

  const term = $("terminal");
  term.scrollTop = term.scrollHeight;
}

function dibujarLineasVivas() {
  const zona = $("lineas-vivas");
  zona.innerHTML = "";
  Object.entries(estado.vivos).forEach(([id, texto]) => {
    const linea = document.createElement("div");
    linea.className = "linea-viva";
    linea.style.color = colorDe(id);
    linea.textContent = `> ${nombreDe(id)} ESTÁ ESCRIBIENDO: ${texto}`;
    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "█";
    linea.appendChild(cursor);
    zona.appendChild(linea);
  });
  const term = $("terminal");
  term.scrollTop = term.scrollHeight;
}

$("form-mensaje").onsubmit = (evento) => {
  evento.preventDefault();
  const campo = $("campo-mensaje");
  const texto = campo.value.trim();
  if (!texto || !estado.ws) return;
  estado.ws.send(JSON.stringify({ tipo: "enviar", texto }));
  campo.value = "";
  campo.focus();
};

document.querySelectorAll("#botones-respuesta button").forEach((boton) => {
  boton.onclick = () => {
    estado.ws.send(JSON.stringify({ tipo: "respuesta", valor: boton.dataset.valor }));
  };
});

// ─── Panel de avatares y acciones de riesgo ───

function dibujarAvatares() {
  const panel = $("panel-avatares");
  panel.innerHTML = "";
  (estado.listaJugadores || []).forEach((j) => {
    const av = AVATARES[j.avatar] || AVATARES[0];
    const ficha = document.createElement("div");
    ficha.className = "ficha-avatar polaroid";
    ficha.id = `ficha-${j.id}`;
    ficha.style.setProperty("--rot", rotacionDe(j.id));
    ficha.innerHTML = `
      <img class="cara" src="${av.img}" alt="">
      <span class="nombre-ficha">${escaparHTML(j.nombre)}</span>`;
    panel.appendChild(ficha);
  });
}

// El micro-glitch del Metamorfo: ~1 segundo, sutil pero detectable
// si alguien está mirando el panel en ese momento.
function mostrarGlitch(jugadorId) {
  const ficha = $(`ficha-${jugadorId}`);
  if (!ficha) return;
  ficha.classList.add("glitch");
  setTimeout(() => ficha.classList.remove("glitch"), 1000);
}

// El Contactado sufre la Interferencia: botones muertos un rato.
function sufrirInterferencia(duracionMs) {
  const botones = document.querySelectorAll("#botones-respuesta button");
  botones.forEach((b) => (b.disabled = true));
  $("nota-contactado").textContent = "⚠ INTERFERENCIA EN TUS CONTROLES ⚠";
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  setTimeout(() => {
    botones.forEach((b) => (b.disabled = false));
    $("nota-contactado").textContent = "";
  }, duracionMs);
}

function mostrarPalabraNueva(palabra) {
  $("palabra-nueva").textContent = palabra.toUpperCase();
  $("overlay-palabra").hidden = false;
  setTimeout(() => {
    $("overlay-palabra").hidden = true;
  }, 3000);
}

function bloquearEmergencia(accion) {
  const boton = $("boton-emergencia");
  boton.disabled = true;
  boton.classList.add("agotado");
  if (accion === "reinicio") {
    // El botón queda trabado; el indicador muestra cuántos faltan.
    $("nota-emergencia").textContent = "REINICIO ENVIADO. ESPERANDO AL RESTO...";
  }
}

// El botón EMERGENCIA es idéntico para todos los roles: solo al
// mantenerlo presionado 1 segundo revela qué hace para tu rol,
// con confirmación. Así nadie deduce roles espiando pantallas.
const ACCIONES_EMERGENCIA = {
  metamorfo: {
    titulo: "INTERFERENCIA MANUAL",
    descripcion:
      "APAGA LOS CONTROLES DEL CONTACTADO POR 15 SEGUNDOS. " +
      "COSTO: TU AVATAR SUFRIRÁ UN GLITCH VISIBLE DE 1 SEGUNDO. UN SOLO USO.",
  },
  contactado: {
    titulo: "TRANSMISIÓN DE EMERGENCIA",
    descripcion:
      "ENVÍA LA PRIMERA LETRA DE LA PALABRA A LA TERMINAL. " +
      "COSTO: −45 SEGUNDOS DE RELOJ. UN SOLO USO.",
  },
  investigador: {
    titulo: "REINICIO DE SISTEMA",
    descripcion:
      "SI TODOS LOS INVESTIGADORES LO ACTIVAN, LA PALABRA CAMBIA POR UNA " +
      "NUEVA Y EL RELOJ RECUPERA 60 SEGUNDOS. TU BOTÓN QUEDARÁ TRABADO. UN SOLO USO.",
  },
};

let temporizadorEmergencia = null;

function abrirConfirmacionEmergencia() {
  const accion = ACCIONES_EMERGENCIA[estado.miRol];
  if (!accion) return;
  $("emergencia-titulo").textContent = accion.titulo;
  $("emergencia-descripcion").textContent = accion.descripcion;
  $("overlay-emergencia").hidden = false;
}

function armarBotonEmergencia() {
  const boton = $("boton-emergencia");

  const empezar = (evento) => {
    if (boton.disabled || estado.fase !== "partida") return;
    evento.preventDefault();
    boton.classList.add("cargando");
    temporizadorEmergencia = setTimeout(() => {
      boton.classList.remove("cargando");
      abrirConfirmacionEmergencia();
    }, 1000);
  };

  const soltar = () => {
    boton.classList.remove("cargando");
    if (temporizadorEmergencia) {
      clearTimeout(temporizadorEmergencia);
      temporizadorEmergencia = null;
    }
  };

  boton.addEventListener("pointerdown", empezar);
  boton.addEventListener("pointerup", soltar);
  boton.addEventListener("pointerleave", soltar);
  boton.addEventListener("pointercancel", soltar);
  // Accesibilidad: con teclado, Enter o Espacio abren la confirmación.
  boton.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && !boton.disabled) {
      e.preventDefault();
      abrirConfirmacionEmergencia();
    }
  });

  $("boton-confirmar-emergencia").onclick = () => {
    $("overlay-emergencia").hidden = true;
    estado.ws.send(JSON.stringify({ tipo: "emergencia" }));
  };
  $("boton-cancelar-emergencia").onclick = () => {
    $("overlay-emergencia").hidden = true;
  };
}

armarBotonEmergencia();

// ─── Juicio Final ───

let votoEmitido = false;
function yaVote() {
  return votoEmitido;
}

function dibujarJuicio() {
  votoEmitido = false;
  const zona = $("lista-sospechosos");
  zona.innerHTML = "";
  $("estado-votos").textContent = "VOTÁ EN SECRETO. EL CONTACTADO QUEDA EXENTO.";

  Object.values(estado.jugadores).forEach((j) => {
    if (j.id === estado.contactadoId) return;
    const boton = document.createElement("button");
    boton.className = "sospechoso";
    boton.style.setProperty("--rot", rotacionDe(j.id));
    const av = AVATARES[j.avatar] || AVATARES[0];
    boton.innerHTML = `
      <img class="cara" src="${av.img}" alt="">
      <span>${escaparHTML(j.nombre)}${j.id === estado.tuId ? " (vos)" : ""}</span>`;
    boton.onclick = () => {
      if (votoEmitido) return;
      votoEmitido = true;
      estado.ws.send(JSON.stringify({ tipo: "votar", objetivoId: j.id }));
      zona.querySelectorAll("button").forEach((b) => (b.disabled = true));
      boton.classList.add("votado");
    };
    zona.appendChild(boton);
  });
}

// ─── Resultado ───

function dibujarFinal(resultado) {
  const gananHumanos = resultado.ganador === "humanos";
  $("titulo-final").textContent = gananHumanos
    ? resultado.motivo === "descifrado"
      ? ":: MENSAJE DESCIFRADO ::"
      : ":: METAMORFO IDENTIFICADO ::"
    : ":: VICTORIA DEL METAMORFO ::";
  $("titulo-final").style.color = gananHumanos ? "#33ff66" : "#ff5040";
  $("titulo-final").style.textShadow = gananHumanos
    ? "0 0 10px rgba(51,255,102,0.6)"
    : "0 0 10px rgba(255,80,64,0.6)";

  // En la derrota, el alien se muestra entero por primera vez.
  $("alien-final").hidden = gananHumanos;
  if (gananHumanos) Sonido.exito();
  else Sonido.derrota();
  if (navigator.vibrate) navigator.vibrate(gananHumanos ? [80, 60, 80] : [250]);

  $("detalle-final").textContent = gananHumanos
    ? "LA HUMANIDAD ESTABLECIÓ PRIMER CONTACTO."
    : "LA SEÑAL SE PERDIÓ PARA SIEMPRE.";

  $("revelacion-final").innerHTML = "";
  const palabra = document.createElement("p");
  palabra.textContent = `LA PALABRA ERA: ${(resultado.palabra || "?").toUpperCase()}`;
  const meta = document.createElement("p");
  meta.textContent = `EL METAMORFO ERA: ${nombreDe(resultado.metamorfoId)}`;
  meta.style.color = "#ff5040";
  $("revelacion-final").append(palabra, meta);

  const lista = $("recuento-votos");
  lista.innerHTML = "";
  (resultado.recuento || []).forEach((r) => {
    const item = document.createElement("li");
    item.textContent = `${nombreDe(r.id)}: ${r.votos} VOTO${r.votos === 1 ? "" : "S"}`;
    lista.appendChild(item);
  });
}

$("boton-revancha").onclick = () => {
  estado.ws.send(JSON.stringify({ tipo: "revancha" }));
};

// ─── Acciones de inicio ───

function validarNombre() {
  const nombre = $("campo-nombre").value.trim();
  if (!nombre) {
    avisar("IDENTIFICACIÓN REQUERIDA. INGRESÁ TU NOMBRE.");
    return null;
  }
  return nombre;
}

$("boton-crear").onclick = async () => {
  if (!validarNombre()) return;
  avisar("BUSCANDO FRECUENCIA LIBRE...");
  // Si la red no responde en 10 segundos, se corta y se avisa.
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 10000);
  try {
    const respuesta = await fetch("/api/crear", {
      method: "POST",
      signal: control.signal,
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      avisar(datos.error || "FALLA EN LA ESTACIÓN. INTENTÁ DE NUEVO.");
      return;
    }
    avisar("");
    conectar(datos.codigo);
  } catch (e) {
    avisar(
      e.name === "AbortError"
        ? "LA ESTACIÓN NO RESPONDE. TU RED PUEDE ESTAR BLOQUEANDO LA SEÑAL: PROBÁ CON DATOS MÓVILES."
        : "SIN CONEXIÓN CON LA ESTACIÓN. REVISÁ TU INTERNET."
    );
  } finally {
    clearTimeout(temporizador);
  }
};

$("boton-unirse").onclick = () => {
  if (!validarNombre()) return;
  const codigo = $("campo-codigo").value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(codigo)) {
    avisar("EL CÓDIGO SON 4 LETRAS. VERIFICALO CON TU EQUIPO.");
    return;
  }
  avisar("");
  conectar(codigo);
};

$("boton-iniciar").onclick = () => {
  estado.ws.send(JSON.stringify({ tipo: "iniciar" }));
};

document.querySelectorAll("#selector-dificultad button").forEach((boton) => {
  boton.onclick = () => {
    estado.ws.send(JSON.stringify({ tipo: "dificultad", valor: boton.dataset.dif }));
  };
});

armarGrillaAvatares();

// ─── El aparato: encendido, perilla de audio y clicks mecánicos ───

// Animación de encendido del tubo, una sola vez por sesión.
if (!sessionStorage.getItem("pc-encendido")) {
  sessionStorage.setItem("pc-encendido", "1");
  const encendido = $("encendido");
  encendido.hidden = false;
  setTimeout(() => encendido.remove(), 1300);
} else {
  $("encendido").remove();
}

function actualizarPerilla(encendido) {
  $("perilla-audio").classList.toggle("activa", encendido);
  $("etiqueta-audio").textContent = `AUDIO: ${encendido ? "ON" : "OFF"}`;
}

$("perilla-audio").onclick = () => {
  const encendido = Sonido.alternar();
  actualizarPerilla(encendido);
  if (encendido) Sonido.encendidoCRT();
};

actualizarPerilla(Sonido.quiereAudio());
// La pantalla inicial ya pide música (sonará cuando se encienda el audio).
Sonido.musica(true);

// El manual de operaciones.
$("boton-instrucciones").onclick = () => {
  $("overlay-instrucciones").hidden = false;
};
$("boton-cerrar-instrucciones").onclick = () => {
  $("overlay-instrucciones").hidden = true;
};

// Todo botón del aparato hace click mecánico al presionarse.
document.addEventListener("pointerdown", (evento) => {
  if (evento.target.closest("button")) Sonido.click();
});
