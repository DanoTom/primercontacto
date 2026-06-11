// Lógica del cliente: pantallas, conexión y lobby.
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

    case "faseCambio":
      if (msg.fase === "partida") {
        registrarJugadores(msg.jugadores);
        iniciarTerminal();
        mostrarPantalla("partida");
      }
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
      // El mensaje enviado reemplaza la línea viva de ese jugador.
      delete estado.vivos[msg.jugadorId];
      dibujarLineasVivas();
      agregarAlHistorial(msg);
      break;

    case "error":
      if (estado.fase === "inicio") {
        avisar(msg.mensaje);
      } else {
        $("nota-iniciar").textContent = msg.mensaje;
      }
      break;
  }
}

// ─── Lobby ───

function dibujarLobby(msg) {
  $("codigo-sala").textContent = estado.codigo;
  $("conteo-lobby").textContent = `OPERADORES EN LÍNEA: ${msg.jugadores.length}/8`;

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

  const soyCreador = msg.creadorId === estado.tuId;
  const boton = $("boton-iniciar");
  boton.hidden = !soyCreador;
  if (soyCreador) {
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

// ─── La Terminal ───

function registrarJugadores(lista) {
  estado.jugadores = {};
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

// El tecleo se transmite agrupado cada ~100 ms (no tecla por tecla),
// pero en pantalla se siente en vivo, borrones incluidos.
function iniciarTerminal() {
  estado.vivos = {};
  $("historial").innerHTML = "";
  $("lineas-vivas").innerHTML = "";
  $("campo-mensaje").value = "";

  let ultimoEnviado = "";
  if (estado.relojTecleo) clearInterval(estado.relojTecleo);
  estado.relojTecleo = setInterval(() => {
    if (estado.fase !== "partida") return;
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

  // Auto-scroll al fondo para seguir la conversación.
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

armarGrillaAvatares();
