// La lista de palabras secretas. Vive solo en el servidor:
// la palabra jamás viaja a los clientes que no deben conocerla.
//
// Criterio: sustantivos concretos, rioplatenses, adivinables por
// preguntas de sí/no. Nada abstracto ni rebuscado.

export const PALABRAS = {
  facil: [
    "perro", "gato", "caballo", "vaca", "gallina", "pato", "conejo",
    "elefante", "jirafa", "león", "mono", "oso", "tiburón", "ballena",
    "delfín", "tortuga", "araña", "mosca", "hormiga", "mariposa",
    "mesa", "silla", "cama", "puerta", "ventana", "cuchara", "tenedor",
    "cuchillo", "plato", "vaso", "botella", "mochila", "zapatilla",
    "pantalón", "sombrero", "anteojos", "reloj", "llave", "libro",
    "lápiz", "pelota", "bicicleta", "pizza", "empanada", "asado",
    "helado", "manzana", "banana", "sandía", "queso",
  ],
  media: [
    "faro", "brújula", "submarino", "payaso", "acordeón", "colibrí",
    "molino", "ancla", "paraguas", "escalera", "martillo",
    "destornillador", "semáforo", "colectivo", "tranvía", "heladera",
    "ventilador", "almohada", "frazada", "espejo", "peine", "esponja",
    "balde", "escoba", "carpa", "fogata", "linterna", "cantimplora",
    "telescopio", "microscopio", "imán", "globo", "barrilete", "trompo",
    "dado", "ajedrez", "guitarra", "tambor", "flauta", "micrófono",
    "escenario", "circo", "museo", "biblioteca", "hospital", "farmacia",
    "panadería", "carnicería", "kiosco", "bombero",
  ],
  dificil: [
    "glaciar", "volcán", "pantano", "oasis", "iceberg", "arrecife",
    "acantilado", "catarata", "laberinto", "péndulo", "yunque",
    "catalejo", "periscopio", "catapulta", "armadura", "escafandra",
    "telar", "brasero", "farol", "candado", "cerrojo", "bisagra",
    "polea", "engranaje", "resorte", "campanario", "calabozo", "muelle",
    "astillero", "granero", "silo", "andamio", "herrero", "apicultor",
    "alfarero", "relojero", "sastre", "cosechadora", "locomotora",
    "zepelín",
  ],
};
