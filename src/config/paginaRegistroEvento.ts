export const paginaRegistroEvento = {
  marca: "CLEAR-IA",
  insignia: "MASTERCLASS GRATUITA DE 90 MINUTOS",
  titulo: "Masterclass Clear-IA",
  fecha: "Miércoles 4 de noviembre",
  horarios: [
    "9:30 a. m. (hora de Ciudad de México)",
    "3:30 p. m. (hora de Ciudad de México)",
  ],
  anfitrion: {
    nombre: "Carlos Torres",
    etiqueta: "Presenta",
    foto: "/pasted-image.png",
    alt: "Carlos Torres",
  },
  tarjeta: {
    titulo: "Reserva tu lugar",
    ayuda:
      "Aprende a captar, calificar y dar seguimiento a tus prospectos con un proceso claro.",
  },
  formulario: {
    nombre: "Nombre",
    apellido: "Apellido",
    correo: "Correo empresarial",
    celular: "Celular",
    horario: "Selecciona tu horario",
    boton: "Registrarme ahora",
    lada: [
      { valor: "+52", label: "MX +52" },
      { valor: "+1", label: "US +1" },
      { valor: "+34", label: "ES +34" },
      { valor: "+57", label: "CO +57" },
      { valor: "+54", label: "AR +54" },
      { valor: "+56", label: "CL +56" },
      { valor: "+51", label: "PE +51" },
    ],
  },
  aprender: {
    etiqueta: "Lo que aprenderás",
    titulo: "Lo que aprenderás en esta masterclass",
    intro:
      "Un recorrido sencillo para ordenar cómo tu negocio capta oportunidades, prioriza prospectos y da seguimiento.",
    puntos: [
      {
        titulo: "Cómo captar oportunidades",
        descripcion:
          "Las formas de atraer prospectos y por qué no basta con tener más contactos.",
      },
      {
        titulo: "Por qué los prospectos no avanzan",
        descripcion:
          "Dónde se pierden las conversaciones y qué información falta para actuar.",
      },
      {
        titulo: "Cómo priorizar a quién atender",
        descripcion:
          "Criterios simples para decidir a quién dar seguimiento primero.",
      },
      {
        titulo: "Cómo dar un siguiente paso claro",
        descripcion:
          "Cómo convertir un diagnóstico en una acción concreta para cada prospecto.",
      },
    ],
  },
  anillo: {
    central: ["1 Captar", "2 Priorizar", "3 Dar", "seguimiento"],
  },
  anfitrionSeccion: {
    etiqueta: "Conoce a tu anfitrión",
    nombre: "Carlos Torres",
    subtitulo: "Anfitrión de la masterclass",
    parrafos: [
      "Carlos Torres será el anfitrión de esta masterclass.",
      "Explicará cómo funciona un diagnóstico para ordenar la captación, la priorización y el seguimiento de prospectos, y cómo empezar a aplicarlo en tu propio negocio.",
    ],
    boton: "Reservar mi lugar",
    // TODO: biografía pendiente, la entrega Carlos
  },
  cierre: {
    titulo: "Regístrate ahora en la masterclass gratuita",
    texto:
      "¿Listo para ordenar cómo captas, priorizas y das seguimiento a tus prospectos?",
    boton: "Reservar mi lugar",
  },
  notaDemo:
    "Página de demostración: el evento, la fecha y los horarios son de ejemplo y no se guardan datos.",
  pie: `© ${new Date().getFullYear()} Clear-IA`,
  volverBiblioteca: "Volver a la biblioteca",
  resultadoDemo:
    "Gracias por registrarte. Esta es una demostración: no se creó ninguna reserva ni se enviará confirmación.",
  horarioOpciones: [
    "9:30 a. m. (hora de Ciudad de México)",
    "3:30 p. m. (hora de Ciudad de México)",
  ],
  confirmacion: {
    confirmado: "confirmado",
    texto: "Mientras tanto, revisa tu resultado para llegar sabiendo en qué punto estás.",
    boton: "Ver mi resultado",
    resultado: {
      leyenda: "Tu resultado",
      tituloInicio: "¿Cómo",
      tituloFinal: " te fue?",
      descripcion:
        "Aquí tienes el resultado de esta autoevaluación previa. Es solo una demostración: no se guarda ninguna respuesta ni se crea ninguna reserva.",
      repetir: "Repetir el cuestionario",
      volver: "Volver a la biblioteca",
      sinPuntaje: "Respuestas registradas",
    },
  },
  cuestionarioPostReserva: {
    titulo: "Cuestionario de seguimiento",
    pregunta: "¿Qué necesitas mejorar principalmente?",
    preguntas: [
      {
        id: "necesidad-principal",
        pregunta: "¿Qué necesitas mejorar principalmente?",
        opciones: [
          { texto: "Generar más leads", puntos: 1 },
          { texto: "Mejorar la calidad de los leads", puntos: 2 },
          { texto: "Convertir más leads en clientes", puntos: 3 },
          { texto: "Mejorar el seguimiento de los prospectos", puntos: 4 },
        ],
      },
      {
        id: "leads-mensuales",
        pregunta: "¿Cuántos leads generas al mes?",
        opciones: [
          { texto: "Menos de 100", puntos: 1 },
          { texto: "Entre 100 y 500", puntos: 2 },
          { texto: "Entre 501 y 2,000", puntos: 3 },
          { texto: "Más de 2,000", puntos: 4 },
        ],
      },
      {
        id: "valor-cliente",
        pregunta: "¿Cuánto vale normalmente un cliente para tu negocio?",
        ayuda: "Selecciona el rango equivalente en tu moneda local.",
        opciones: [
          { texto: "Menos de US$500", puntos: 1 },
          { texto: "US$500–US$2,000", puntos: 2 },
          { texto: "US$2,001–US$10,000", puntos: 3 },
          { texto: "Más de US$10,000", puntos: 4 },
        ],
      },
      {
        id: "plazo-resultados",
        pregunta: "¿Qué tan pronto quieres mejorar tus resultados?",
        opciones: [
          { texto: "Lo antes posible", puntos: 4 },
          { texto: "Durante el próximo mes", puntos: 3 },
          { texto: "En los próximos 3 meses", puntos: 2 },
          { texto: "Solo estoy explorando opciones", puntos: 1 },
        ],
      },
      {
        id: "scoreapp",
        pregunta: "¿Actualmente utilizas ScoreApp?",
        opciones: [
          { texto: "Sí, lo utilizo actualmente", puntos: 4 },
          { texto: "Lo probé anteriormente", puntos: 3 },
          { texto: "Estoy evaluando utilizarlo", puntos: 2 },
          { texto: "No, nunca lo he utilizado", puntos: 1 },
        ],
      },
    ],
  },
};
