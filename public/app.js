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
    boton.innerHTML = `
      <span class="cara" style="background:${av.color}">${av.iniciales}</span>
      <span class="rotulo">${av.nombre}</span>`;
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
      mostrarPantalla("inicio");
      avisar("SEÑAL PERDIDA. VOLVÉ A INTENTAR.");
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
      mostrarError(msg.mensaje);
      break;
  }
}

function mostrarError(mensaje) {
  if (estado.fase === "inicio") avisar(mensaje);
  else if (estado.fase === "lobby") $("nota-iniciar").textContent = mensaje;
  else if (estado.fase === "juicio") $("estado-votos").textContent = mensaje;
}

function manejarFaseCambio(msg) {
  if (msg.fase === "partida") {
    if (msg.jugadores) registrarJugadores(msg.jugadores);
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
    // Revancha: el lobby actualizado llega en el próximo mensaje.
    mostrarPantalla("lobby");
  }
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
    const esJefe = j.id === msg.creadorId;
    const sosVos = j.id === estado.tuId;
    item.innerHTML = `
      <span class="cara" style="background:${av.color}">${av.iniciales}</span>
      <span>${escaparHTML(j.nombre)}${sosVos ? " (VOS)" : ""}</span>
      ${esJefe ? '<span class="etiqueta-jefe">JEFE DE ESTACIÓN</span>' : ""}`;
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

// ─── Revelación de rol ───

function dibujarRevelacion(msg) {
  const rol = ROLES[msg.rol];
  $("rol-titulo").textContent = rol.titulo;
  $("rol-descripcion").textContent = rol.descripcion;
  $("rol-palabra").hidden = !msg.palabra;
  if (msg.palabra) {
    $("palabra-secreta").textContent = msg.palabra.toUpperCase();
  }
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

  const pintar = () => {
    const restante = Math.max(0, objetivo - Date.now());
    const segundos = Math.ceil(restante / 1000);
    const mm = String(Math.floor(segundos / 60)).padStart(2, "0");
    const ss = String(segundos % 60).padStart(2, "0");
    const elemento = $(elementoId);
    if (elemento) elemento.textContent = `${mm}:${ss}`;
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

  // El Contactado no tiene teclado: ve sus 5 botones de respuesta.
  const soyContactado = estado.miRol === "contactado";
  $("form-mensaje").hidden = soyContactado;
  $("panel-contactado").hidden = !soyContactado;

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

function agregarLineaSistema(texto) {
  const linea = document.createElement("div");
  linea.className = "linea-sistema";
  linea.textContent = `*** ${texto} ***`;
  $("historial").appendChild(linea);

  // Vibración en las respuestas del Contactado (donde haya soporte).
  if (navigator.vibrate) navigator.vibrate(80);

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
    const av = AVATARES[j.avatar] || AVATARES[0];
    boton.innerHTML = `
      <span class="cara" style="background:${av.color}">${av.iniciales}</span>
      <span>${escaparHTML(j.nombre)}${j.id === estado.tuId ? " (VOS)" : ""}</span>`;
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
  $("titulo-final").style.color = gananHumanos ? "#33ff66" : "#cc2a1f";

  $("detalle-final").textContent = gananHumanos
    ? "LA HUMANIDAD ESTABLECIÓ PRIMER CONTACTO."
    : "LA SEÑAL SE PERDIÓ PARA SIEMPRE.";

  $("revelacion-final").innerHTML = "";
  const palabra = document.createElement("p");
  palabra.textContent = `LA PALABRA ERA: ${(resultado.palabra || "?").toUpperCase()}`;
  const meta = document.createElement("p");
  meta.textContent = `EL METAMORFO ERA: ${nombreDe(resultado.metamorfoId)}`;
  meta.style.color = "#cc2a1f";
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
  try {
    const respuesta = await fetch("/api/crear", { method: "POST" });
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      avisar(datos.error || "FALLA EN LA ESTACIÓN. INTENTÁ DE NUEVO.");
      return;
    }
    avisar("");
    conectar(datos.codigo);
  } catch {
    avisar("SIN CONEXIÓN CON LA ESTACIÓN. REVISÁ TU INTERNET.");
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
