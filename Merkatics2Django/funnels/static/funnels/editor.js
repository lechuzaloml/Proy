(() => {
  const root = document.querySelector(".custom-editor:not([data-published])");
  if (!root) return;

  const source = document.getElementById("editor-initial-configuration");
  const form = document.getElementById("questionnaire-editor-form");
  const fields = document.getElementById("editor-fields");
  const preview = document.getElementById("editor-preview");
  const configurationInput = document.getElementById("editor-configuration-input");
  const nameInput = document.getElementById("editor-questionnaire-name");
  const scoringInput = document.getElementById("editor-scoring-enabled");
  const scoringNote = document.getElementById("editor-scoring-note");
  const scoringConfirmation = document.getElementById("editor-scoring-confirmation");
  const scoringError = document.getElementById("editor-scoring-error");
  const isNewQuestionnaire = root.hasAttribute("data-new-questionnaire");
  let configuration;
  let previewIndex = 0;

  const showLoadError = () => {
    const error = document.createElement("p");
    error.className = "admin-error";
    error.textContent = "No se pudo cargar la configuración del cuestionario.";
    error.setAttribute("role", "alert");
    root.prepend(error);
    if (form) form.hidden = true;
  };
  if (!source || !form || !fields || !preview || !configurationInput || !nameInput || !scoringInput) {
    showLoadError();
    return;
  }

  try {
    configuration = JSON.parse(source.value);
  } catch (_error) {
    showLoadError();
    return;
  }
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    showLoadError();
    return;
  }

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const button = (parent, text, action, disabled = false, className = "secondary-button") => {
    const node = element("button", className, text);
    node.type = "button";
    node.disabled = disabled;
    node.addEventListener("click", action);
    parent.append(node);
    return node;
  };

  const labelField = (parent, title, value, options = {}) => {
    const label = element("label", options.className || "");
    label.append(document.createTextNode(title));
    const control = element(options.multiline ? "textarea" : "input");
    if (!options.multiline) control.type = options.type || "text";
    if (options.type === "number") control.step = "any";
    if (options.maxLength) control.maxLength = options.maxLength;
    if (options.placeholder) control.placeholder = options.placeholder;
    if (options.multiline && options.maxLength) control.maxLength = options.maxLength;
    control.value = value === undefined || value === null ? "" : String(value);
    control.addEventListener(options.event || "input", () => {
      options.onChange(control.value);
      if (options.rerender) render();
    });
    label.append(control);
    parent.append(label);
    return control;
  };

  const checkbox = (parent, title, checked, onChange, className = "") => {
    const label = element("label", className);
    const input = element("input", "custom-editor-checkbox");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", () => onChange(input.checked));
    label.append(input, document.createTextNode(title));
    parent.append(label);
    return input;
  };

  const heading = (number, kicker, title, description, id) => {
    const header = element("header", "custom-editor-section-heading");
    header.append(element("span", "editor-section-number", number));
    const copy = element("div");
    copy.append(element("p", "eyebrow", kicker));
    const h2 = element("h2", "", title);
    if (id) h2.id = id;
    copy.append(h2, element("p", "", description));
    header.append(copy);
    return header;
  };

  const section = (parent, className, number, kicker, title, description, id) => {
    const node = element("section", className);
    if (id) node.setAttribute("aria-labelledby", id);
    node.append(heading(number, kicker, title, description, id));
    parent.append(node);
    return node;
  };

  const ensureWelcome = () => {
    configuration.bienvenida = {
      habilitada: true,
      titulo: "Diagnóstico inicial de crecimiento",
      descripcion: "Antes de empezar, te haremos unas preguntas para entender mejor tu situación actual.",
      imagen: "",
      tiempoEstimado: "3-5 minutos",
      textoBoton: "Iniciar diagnóstico",
      ...(configuration.bienvenida || {}),
    };
  };

  const newQuestion = (type) => {
    const question = {
      id: `pregunta-${crypto.randomUUID()}`,
      texto: isNewQuestionnaire ? "" : "Escribe la pregunta",
      participa_scoring: false,
      tipo: type === "si_no" ? "opcion_multiple" : type,
    };
    if (isNewQuestionnaire && !configuration.familia_base) {
      configuration.familia_base = type;
    }
    if (question.tipo === "opcion_multiple") {
      question.opciones = type === "si_no"
        ? [{ texto: "Sí" }, { texto: "No" }]
        : isNewQuestionnaire
          ? [{ texto: "" }, { texto: "" }]
          : [{ texto: "Opción 1" }, { texto: "Opción 2" }];
    } else if (question.tipo === "escala") {
      question.escala = { min: 1, max: 5, etiqueta_min: "", etiqueta_max: "" };
    }
    return question;
  };

  const syncSections = () => {
    const hasSections = Array.isArray(configuration.secciones);
    if ("secciones" in configuration && !hasSections) return;
    const sections = hasSections ? [...configuration.secciones] : [];
    for (const question of configuration.preguntas || []) {
      if (question.seccion && !sections.includes(question.seccion)) {
        sections.push(question.seccion);
      }
    }
    if (hasSections || sections.length) configuration.secciones = sections;
  };

  const setScoring = (enabled, confirmed = false) => {
    if (enabled === configuration.usa_scoring) return;
    if (!enabled) {
      if (
        configuration.usa_scoring &&
        Array.isArray(configuration.resultado?.resultados) &&
        configuration.resultado.resultados.length > 1 &&
        !confirmed
      ) {
        scoringConfirmation.hidden = false;
        scoringInput.checked = true;
        return;
      }
      const firstResult = Array.isArray(configuration.resultado?.resultados)
        ? configuration.resultado.resultados.find((result) =>
          result &&
          typeof result === "object" &&
          !Array.isArray(result) &&
          typeof result.segmento === "string" &&
          result.segmento.trim() &&
          typeof result.contenido === "string" &&
          result.contenido.trim()
        )
        : null;
      if (!firstResult) {
        scoringError.textContent = "Añade al menos un resultado por segmento antes de desactivar el scoring.";
        scoringError.hidden = false;
        scoringInput.checked = true;
        return;
      }
      scoringConfirmation.hidden = true;
      scoringError.hidden = true;
      const fixedResult = { ...firstResult };
      delete fixedResult.segmento;
      delete fixedResult.tipo;
      configuration.resultado = { ...fixedResult, tipo: "fijo" };
      delete configuration.reglas_scoring;
      configuration.preguntas = configuration.preguntas.map((question) => ({
        ...question,
        participa_scoring: false,
      }));
      configuration.usa_scoring = false;
    } else {
      scoringConfirmation.hidden = true;
      scoringError.hidden = true;
      const fixedResult = { ...(configuration.resultado || {}) };
      delete fixedResult.tipo;
      configuration.usa_scoring = true;
      configuration.reglas_scoring = [{
        puntaje_min: 0,
        puntaje_max: 0,
        segmento: isNewQuestionnaire ? "" : "General",
      }];
      configuration.resultado = {
        tipo: "por_segmento",
        resultados: [{
          ...fixedResult,
          segmento: isNewQuestionnaire ? "" : "General",
          contenido: isNewQuestionnaire ? "" : (fixedResult.contenido || ""),
        }],
      };
      configuration.preguntas = configuration.preguntas.map((question) => ({
        ...question,
        participa_scoring: false,
      }));
    }
    render();
  };

  const updatePreview = () => {
    preview.replaceChildren();
    preview.dataset.presentation = "template";
    if (configuration.estilo_visual) preview.dataset.style = configuration.estilo_visual;
    else delete preview.dataset.style;

    const questions = Array.isArray(configuration.preguntas)
      ? configuration.preguntas
      : [];
    previewIndex = Math.max(0, Math.min(previewIndex, questions.length - 1));
    const brand = element("div", "editor-preview-brand");
    const brandMark = element("img");
    brandMark.src = preview.dataset.brandMark;
    brandMark.alt = "";
    brandMark.setAttribute("aria-hidden", "true");
    brand.append(brandMark, element("span", "", "CLEAR-IA"));
    preview.append(brand);

    const progress = element("div", "editor-preview-progress");
    const progressValue = element("span");
    progressValue.style.width = questions.length
      ? `${((previewIndex + 1) / questions.length) * 100}%`
      : "0%";
    progress.append(progressValue);
    preview.append(progress);
    preview.append(element(
      "p",
      "editor-preview-step",
      questions.length ? `Pregunta ${previewIndex + 1} de ${questions.length}` : "Sin preguntas",
    ));

    const flow = element("div", "editor-preview-flow questionnaire-view");
    const contact = () => {
      const panel = element("section", "editor-preview-contact");
      panel.setAttribute("aria-label", "Vista previa de los datos de contacto");
      panel.append(element("p", "editor-preview-kicker", "Datos de contacto"));
      const contactFields = element("div", "editor-preview-contact-fields");
      for (const label of ["Nombre", "Correo electrónico", "Teléfono / WhatsApp"]) {
        const field = element("span");
        field.append(document.createTextNode(label));
        field.append(element("strong", "", "Obligatorio"));
        contactFields.append(field);
      }
      panel.append(contactFields);
      const consent = element("div", "editor-preview-consent");
      consent.append(
        element("span"),
        document.createTextNode("He leído el aviso y consiento el uso de mis datos para los fines descritos."),
      );
      panel.append(consent);
      return panel;
    };

    if (configuration.posicion_contacto === "inicio") flow.append(contact());
    const question = questions[previewIndex];
    if (!question) {
      flow.append(element("p", "editor-preview-empty", "Agrega una pregunta para ver cómo aparecerá."));
    } else {
      const card = element("article", "editor-preview-question question-card");
      if (question.seccion) card.append(element("p", "question-card-section", question.seccion));
      const questionTitle = element("h3", "", question.texto || "Escribe el texto de tu pregunta");
      questionTitle.tabIndex = -1;
      card.append(questionTitle);
      if (question.tipo === "opcion_multiple") {
        const list = element("ul", "editor-preview-options option-list option-list-filas");
        if (question.opciones?.length === 2) list.classList.add("option-list-binary");
        (question.opciones || []).forEach((option, index) => {
          const item = element("li", "option option-choice-filas");
          if (question.opciones.length !== 2) {
            item.append(element("span", "option-number", String(index + 1).padStart(2, "0")));
          }
          item.append(
            element("span", "option-choice-text", option.texto || `Opción ${index + 1}`),
            element("span", "editor-preview-radio"),
          );
          list.append(item);
        });
        card.append(list);
      } else if (question.tipo === "escala") {
        const scale = question.escala || { min: 1, max: 5 };
        const choices = element("div", "editor-preview-scale");
        const values = element("div", "scale-choices scale-choices-circulos");
        const minimum = Number(scale.min);
        const maximum = Number(scale.max);
        if (Number.isFinite(minimum) && Number.isFinite(maximum)) {
          const count = Math.min(31, Math.max(0, Math.floor(maximum) - Math.ceil(minimum) + 1));
          for (let index = 0; index < count; index += 1) {
            const value = Math.ceil(minimum) + index;
            const item = element("span", "scale-choice");
            item.append(element("span", "", value));
            values.append(item);
          }
        }
        choices.append(values);
        const labels = element("p");
        labels.append(
          element("span", "", scale.etiqueta_min ?? scale.min),
          element("span", "", scale.etiqueta_max ?? scale.max),
        );
        choices.append(labels);
        card.append(choices);
      } else {
        card.append(element("div", "editor-preview-textarea text-answer", "Tu respuesta…"));
      }
      flow.append(card);
    }
    if (configuration.posicion_contacto !== "inicio") flow.append(contact());
    preview.append(flow);

    if (question) {
      const navigation = element("nav", "flow-navigation editor-preview-navigation");
      navigation.setAttribute("aria-label", "Navegación de la vista previa");
      button(navigation, "Anterior", () => {
        previewIndex = Math.max(0, previewIndex - 1);
        updatePreview();
      }, previewIndex === 0);
      navigation.append(element(
        "span",
        "",
        `${String(previewIndex + 1).padStart(2, "0")} / ${String(questions.length).padStart(2, "0")}`,
      ));
      button(navigation, previewIndex >= questions.length - 1 ? "Finalizar" : "Continuar", () => {
        previewIndex = Math.min(questions.length - 1, previewIndex + 1);
        updatePreview();
      }, previewIndex >= questions.length - 1);
      preview.append(navigation);
    }
  };

  const render = () => {
    fields.replaceChildren();
    scoringInput.checked = Boolean(configuration.usa_scoring);
    scoringNote.hidden = Boolean(configuration.usa_scoring);

    const contact = section(
      fields,
      "custom-editor-contact-settings",
      "01",
      "Primer paso",
      "Datos de contacto",
      "Elige cuándo pedirlos. El formulario incluye los campos fijos que admite Clear-IA.",
      "editor-contact-heading",
    );
    const contactBody = element("div", "custom-editor-contact-body");
    const positionLabel = element("label");
    positionLabel.append(document.createTextNode("Momento de solicitud"));
    const position = element("select");
    for (const [value, text] of [
      ["inicio", "Antes de las preguntas"],
      ["final", "Después de las preguntas"],
    ]) {
      const option = element("option", "", text);
      option.value = value;
      position.append(option);
    }
    position.value = configuration.posicion_contacto || "final";
    position.addEventListener("change", () => {
      configuration.posicion_contacto = position.value;
      updatePreview();
    });
    positionLabel.append(position);
    contactBody.append(positionLabel);
    const fixedFields = element("ul", "custom-editor-contact-fields");
    fixedFields.setAttribute("aria-label", "Campos obligatorios incluidos");
    for (const text of ["Nombre", "Correo electrónico", "Teléfono / WhatsApp"]) {
      const item = element("li");
      item.append(document.createTextNode(text), element("span", "", "Obligatorio"));
      fixedFields.append(item);
    }
    contactBody.append(fixedFields);
    contact.append(contactBody);

    const welcome = section(
      fields,
      "custom-editor-welcome-settings",
      "02",
      "Antes de empezar",
      "Pantalla de bienvenida",
      "Configura una introducción breve para presentar el diagnóstico antes de las preguntas.",
      "editor-welcome-heading",
    );
    const welcomeData = configuration.bienvenida || {};
    checkbox(
      welcome,
      "Mostrar pantalla de bienvenida",
      welcomeData.habilitada ?? true,
      (enabled) => {
        ensureWelcome();
        configuration.bienvenida.habilitada = enabled;
        render();
      },
      "custom-editor-toggle",
    );
    if (welcomeData.habilitada ?? true) {
      const welcomeBody = element("div", "custom-editor-welcome-body");
      labelField(welcomeBody, "Título de bienvenida", welcomeData.titulo ?? (isNewQuestionnaire ? "" : "Diagnóstico inicial de crecimiento"), {
        onChange: (value) => {
          ensureWelcome();
          configuration.bienvenida.titulo = value;
        },
      });
      labelField(welcomeBody, "Descripción", welcomeData.descripcion ?? (isNewQuestionnaire ? "" : "Antes de empezar, te haremos unas preguntas para entender mejor tu situación actual."), {
        multiline: true,
        onChange: (value) => {
          ensureWelcome();
          configuration.bienvenida.descripcion = value;
        },
      });
      labelField(welcomeBody, "Imagen opcional (URL)", welcomeData.imagen ?? "", {
        onChange: (value) => {
          ensureWelcome();
          configuration.bienvenida.imagen = value;
        },
      });
      const welcomeRow = element("div", "custom-editor-welcome-row");
      labelField(welcomeRow, "Tiempo estimado", welcomeData.tiempoEstimado ?? "", {
        placeholder: "3-5 minutos",
        onChange: (value) => {
          ensureWelcome();
          configuration.bienvenida.tiempoEstimado = value;
        },
      });
      labelField(welcomeRow, "Texto del botón", welcomeData.textoBoton ?? (isNewQuestionnaire ? "" : "Iniciar diagnóstico"), {
        onChange: (value) => {
          ensureWelcome();
          configuration.bienvenida.textoBoton = value;
        },
      });
      welcomeBody.append(welcomeRow);
      welcome.append(welcomeBody);
    }
    const landing = element("fieldset", "custom-editor-question");
    landing.append(element("legend", "", "Landing opcional"));
    labelField(landing, "Título de la landing", configuration.landingTitulo || "", {
      onChange: (value) => {
        if (value) configuration.landingTitulo = value;
        else delete configuration.landingTitulo;
      },
    });
    labelField(landing, "Descripción de la landing", configuration.landingDescripcion || "", {
      multiline: true,
      onChange: (value) => {
        if (value) configuration.landingDescripcion = value;
        else delete configuration.landingDescripcion;
      },
    });
    welcome.append(landing);

    const questions = section(
      fields,
      "custom-editor-questions",
      "02",
      "Contenido",
      "Preguntas",
      `${(configuration.preguntas || []).length} ${(configuration.preguntas || []).length === 1 ? "pregunta configurada" : "preguntas configuradas"}`,
      "editor-questions-heading",
    );
    const questionList = Array.isArray(configuration.preguntas) ? configuration.preguntas : [];
    const sectionNames = Array.isArray(configuration.secciones) ? configuration.secciones : [];
    if (!questionList.length) {
      questions.append(element("p", "admin-empty", "Todavía no hay preguntas. Elige un tipo y agrega la primera."));
    }
    questionList.forEach((question, questionIndex) => {
      const card = element("article", "custom-editor-question");
      const title = element("div", "custom-editor-question-heading");
      title.append(element("span", "editor-question-number", String(questionIndex + 1).padStart(2, "0")));
      const titleCopy = element("div", "editor-question-title");
      const typeNames = {
        opcion_multiple: "Opción múltiple",
        escala: "Escala",
        abierta: "Respuesta abierta",
      };
      titleCopy.append(
        element("span", "editor-question-type", typeNames[question.tipo] || "Pregunta"),
        element("h3", "", `Pregunta ${questionIndex + 1}`),
      );
      title.append(titleCopy);
      button(title, "Subir", () => {
        if (questionIndex === 0) return;
        const [item] = configuration.preguntas.splice(questionIndex, 1);
        configuration.preguntas.splice(questionIndex - 1, 0, item);
        render();
      }, questionIndex === 0);
      button(title, "Bajar", () => {
        if (questionIndex === configuration.preguntas.length - 1) return;
        const [item] = configuration.preguntas.splice(questionIndex, 1);
        configuration.preguntas.splice(questionIndex + 1, 0, item);
        render();
      }, questionIndex === configuration.preguntas.length - 1);
      button(title, "Duplicar", () => {
        const copy = structuredClone(question);
        copy.id = `pregunta-${crypto.randomUUID()}`;
        configuration.preguntas.splice(questionIndex + 1, 0, copy);
        render();
      });
      button(title, "Eliminar pregunta", () => {
        configuration.preguntas.splice(questionIndex, 1);
        if (isNewQuestionnaire && configuration.preguntas.length === 0) {
          delete configuration.familia_base;
        }
        render();
      });
      card.append(title);
      checkbox(
        card,
        "Pregunta obligatoria",
        question.obligatoria !== false,
        (enabled) => {
          question.obligatoria = enabled;
        },
      );
      labelField(card, "Texto de la pregunta", question.texto, {
        multiline: true,
        maxLength: 1000,
        onChange: (value) => {
          question.texto = value;
          updatePreview();
        },
      });
      const questionSectionLabel = element("label");
      questionSectionLabel.append(document.createTextNode("Sección"));
      const questionSectionSelect = element("select");
      const noSectionOption = element("option", "", "Sin sección");
      noSectionOption.value = "";
      questionSectionSelect.append(noSectionOption);
      [...new Set(sectionNames.filter((name) => typeof name === "string" && name.trim()))]
        .forEach((name) => {
          const option = element("option", "", name);
          option.value = name;
          questionSectionSelect.append(option);
        });
      questionSectionSelect.value = question.seccion || "";
      questionSectionSelect.addEventListener("change", () => {
        if (questionSectionSelect.value) {
          question.seccion = questionSectionSelect.value;
        } else {
          delete question.seccion;
        }
        updatePreview();
      });
      questionSectionLabel.append(questionSectionSelect);
      card.append(questionSectionLabel);

      if (question.tipo === "opcion_multiple") {
        const options = element("fieldset", "custom-editor-options");
        options.append(element("legend", "", "Opciones de respuesta"));
        (question.opciones || []).forEach((option, optionIndex) => {
          const row = element("div", "custom-editor-option");
          labelField(row, `Opción ${optionIndex + 1}`, option.texto, {
            maxLength: 300,
            onChange: (value) => {
              option.texto = value;
              updatePreview();
            },
          });
          if (configuration.usa_scoring) {
            labelField(row, "Puntos", option.puntos, {
              type: "number",
              onChange: (value) => {
                if (value.trim() === "") delete option.puntos;
                else option.puntos = Number(value);
              },
            });
          }
          button(row, "Quitar", () => {
            if (question.opciones.length > 1) question.opciones.splice(optionIndex, 1);
            render();
          }, question.opciones.length <= 1);
          options.append(row);
        });
        button(options, "Añadir opción", () => {
          question.opciones.push({ texto: "Nueva opción" });
          render();
        });
        card.append(options);
      }

      if (question.tipo === "escala") {
        question.escala = question.escala || { min: 1, max: 5 };
        const scale = element("fieldset");
        scale.append(element("legend", "", "Escala"));
        labelField(scale, "Valor mínimo", question.escala.min, {
          type: "number",
          event: "change",
          rerender: true,
          onChange: (value) => {
            question.escala.min = value.trim() === "" ? null : Number(value);
          },
        });
        labelField(scale, "Valor máximo", question.escala.max, {
          type: "number",
          event: "change",
          rerender: true,
          onChange: (value) => {
            question.escala.max = value.trim() === "" ? null : Number(value);
          },
        });
        labelField(scale, "Etiqueta del extremo mínimo", question.escala.etiqueta_min ?? "", {
          onChange: (value) => {
            question.escala.etiqueta_min = value;
            updatePreview();
          },
        });
        labelField(scale, "Etiqueta del extremo máximo", question.escala.etiqueta_max ?? "", {
          onChange: (value) => {
            question.escala.etiqueta_max = value;
            updatePreview();
          },
        });
        card.append(scale);
      }

      if (question.tipo === "abierta") {
        labelField(card, "Límite de caracteres", question.limite_caracteres ?? "", {
          type: "number",
          onChange: (value) => {
            if (value.trim() === "") delete question.limite_caracteres;
            else question.limite_caracteres = Number(value);
          },
        });
      }

      if (configuration.usa_scoring) {
        const scoring = element("fieldset");
        scoring.append(element("legend", "", "Puntuación de la pregunta"));
        const scoringToggle = checkbox(
          scoring,
          "Incluir en el scoring",
          question.participa_scoring,
          (enabled) => {
            question.participa_scoring = enabled;
          },
          "custom-editor-scoring-toggle",
        );
        if (question.tipo === "abierta") scoringToggle.querySelector("input").disabled = true;
        if (question.tipo === "escala") {
          const minimum = Math.ceil(Number(question.escala.min));
          const maximum = Math.floor(Number(question.escala.max));
          const count = maximum - minimum + 1;
          const values = Number.isFinite(count) && count > 0 && count <= 30
            ? Array.from({ length: count }, (_value, index) => minimum + index)
            : Object.keys(question.puntos_por_valor || {}).map(Number).sort((a, b) => a - b);
          values.forEach((value) => {
            labelField(scoring, `Puntos para el valor ${value}`, question.puntos_por_valor?.[String(value)], {
              type: "number",
              onChange: (entry) => {
                question.puntos_por_valor = question.puntos_por_valor || {};
                if (entry.trim() === "") delete question.puntos_por_valor[String(value)];
                else question.puntos_por_valor[String(value)] = Number(entry);
                if (!Object.keys(question.puntos_por_valor).length) delete question.puntos_por_valor;
              },
            });
          });
          if (Number(question.escala.max) - Number(question.escala.min) >= 30) {
            scoring.append(element("p", "", "Para rangos de más de 30 valores se muestran únicamente los valores que ya tienen puntuación."));
          }
        }
        card.append(scoring);
      }
      questions.append(card);
    });

    const sections = element("fieldset", "custom-editor-question");
    sections.append(
      element("legend", "", "Secciones"),
      element("p", "", "Agrupa las preguntas por tema."),
    );
    sectionNames.forEach((name, index) => {
      const row = element("div", "custom-editor-option");
      labelField(row, `Sección ${index + 1}`, name, {
        event: "change",
        rerender: true,
        onChange: (value) => {
          const previousName = configuration.secciones[index];
          const newName = value.trim();
          configuration.secciones[index] = newName;
          for (const question of configuration.preguntas || []) {
            if (question.seccion === previousName) {
              if (newName) question.seccion = newName;
              else delete question.seccion;
            }
          }
          if (Array.isArray(configuration.personalizacion_dimension)) {
            for (const dimension of configuration.personalizacion_dimension) {
              if (dimension.seccion === previousName) {
                dimension.seccion = newName;
              }
            }
          }
          updatePreview();
        },
      });
      button(row, "Quitar", () => {
        const removedName = configuration.secciones[index];
        configuration.secciones.splice(index, 1);
        for (const question of configuration.preguntas || []) {
          if (question.seccion === removedName) delete question.seccion;
        }
        if (Array.isArray(configuration.personalizacion_dimension)) {
          configuration.personalizacion_dimension =
            configuration.personalizacion_dimension.filter(
              (dimension) => dimension.seccion !== removedName,
            );
        }
        render();
      }, sectionNames.length <= 1);
      sections.append(row);
    });
    button(sections, "Añadir sección", () => {
      configuration.secciones = configuration.secciones || [];
      configuration.secciones.push(`Nueva sección ${configuration.secciones.length + 1}`);
      render();
    });
    questions.append(sections);

    const questionAdd = element("section", "custom-editor-add");
    questionAdd.setAttribute("aria-label", "Añadir pregunta");
    const typeLabel = element("label");
    typeLabel.append(document.createTextNode("Tipo de pregunta"));
    const typeSelect = element("select");
    const familyTypes = configuration.familia_base
      ? [configuration.familia_base]
      : questionList.length
        ? Array.from(new Set(questionList.map((question) =>
          question.tipo === "opcion_multiple"
            ? ((question.opciones || []).every((option) => ["Sí", "No"].includes(option.texto))
              ? "si_no"
              : "opcion_multiple")
            : question.tipo
          )))
        : [];
    const availableTypes = familyTypes.length
      ? familyTypes
      : ["opcion_multiple", "si_no", "escala", "abierta"];
    for (const [type, text] of [
      ["opcion_multiple", "Opción múltiple"],
      ["si_no", "Sí o no"],
      ["escala", "Escala"],
      ["abierta", "Respuesta abierta"],
    ]) {
      if (!availableTypes.includes(type)) continue;
      const option = element("option", "", text);
      option.value = type;
      typeSelect.append(option);
    }
    typeLabel.append(typeSelect);
    questionAdd.append(typeLabel);
    button(questionAdd, "Añadir pregunta", () => {
      configuration.preguntas.push(newQuestion(typeSelect.value));
      render();
    });
    questions.append(questionAdd);

    if (configuration.usa_scoring) {
      const scoringSection = section(
        fields,
        "custom-editor-questions custom-editor-config-section",
        "03",
        "Evaluación",
        "Reglas de puntuación",
        "Define los rangos y el segmento de resultado asociado.",
        "editor-scoring-heading",
      );
      (configuration.reglas_scoring || []).forEach((rule, index) => {
        const fieldset = element("fieldset", "custom-editor-question");
        fieldset.append(element("legend", "", `Rango ${index + 1}`));
        labelField(fieldset, "Puntaje mínimo", rule.puntaje_min, {
          type: "number",
          onChange: (value) => {
            rule.puntaje_min = value.trim() === "" ? null : Number(value);
          },
        });
        labelField(fieldset, "Puntaje máximo", rule.puntaje_max, {
          type: "number",
          onChange: (value) => {
            rule.puntaje_max = value.trim() === "" ? null : Number(value);
          },
        });
        labelField(fieldset, "Segmento", rule.segmento, {
          maxLength: 120,
          onChange: (value) => {
            const previous = rule.segmento;
            rule.segmento = value;
            const result = configuration.resultado.resultados.find((item) => item.segmento === previous);
            if (result) result.segmento = value;
          },
        });
        button(fieldset, "Quitar rango", () => {
          configuration.reglas_scoring.splice(index, 1);
          render();
        }, configuration.reglas_scoring.length <= 1);
        scoringSection.append(fieldset);
      });
      button(scoringSection, "Añadir rango", () => {
        const segment = `Nuevo segmento ${configuration.reglas_scoring.length + 1}`;
        configuration.reglas_scoring.push({
        puntaje_min: 0,
        puntaje_max: 0,
        segmento: isNewQuestionnaire ? "" : segment,
        });
        if (!configuration.resultado.resultados.some((result) => result.segmento === segment)) {
          configuration.resultado.resultados.push({
            segmento: segment,
            contenido: "Escribe el resultado",
          });
        }
        render();
      });

      const results = section(
        fields,
        "custom-editor-questions custom-editor-config-section",
        "04",
        "Personalización",
        "Resultados por segmento",
        "Redacta el contenido que recibirá cada segmento.",
        "editor-segments-heading",
      );
      (configuration.resultado.resultados || []).forEach((result, index) => {
        const fieldset = element("fieldset", "custom-editor-question");
        fieldset.append(element("legend", "", result.segmento || `Segmento ${index + 1}`));
        labelField(fieldset, "Segmento", result.segmento, {
          maxLength: 120,
          onChange: (value) => {
            result.segmento = value;
            fieldset.querySelector("legend").textContent = value || `Segmento ${index + 1}`;
          },
        });
        labelField(fieldset, "Contenido del resultado", result.contenido, {
          multiline: true,
          maxLength: 5000,
          onChange: (value) => {
            result.contenido = value;
          },
        });
        if (result.cta) {
          labelField(fieldset, "Texto de la llamada a la acción", result.cta.texto, {
            maxLength: 300,
            onChange: (value) => {
              result.cta.texto = value;
            },
          });
          labelField(fieldset, "Acción de la llamada a la acción", result.cta.accion, {
            maxLength: 500,
            onChange: (value) => {
              result.cta.accion = value;
            },
          });
          button(fieldset, "Quitar llamada a la acción", () => {
            delete result.cta;
            render();
          });
        } else {
          button(fieldset, "Añadir llamada a la acción", () => {
            result.cta = { texto: "", accion: "" };
            render();
          });
        }
        button(fieldset, "Quitar resultado", () => {
          configuration.resultado.resultados.splice(index, 1);
          render();
        }, configuration.resultado.resultados.length <= 1);
        results.append(fieldset);
      });
      button(results, "Añadir resultado", () => {
        configuration.resultado.resultados.push({
          segmento: "Nuevo segmento",
          contenido: "",
        });
        render();
      });
    } else {
      const fixed = section(
        fields,
        "custom-editor-questions custom-editor-config-section",
        "03",
        "Cierre",
        "Resultado fijo",
        "Configura el contenido que se mostrará al terminar.",
        "editor-fixed-result-heading",
      );
      labelField(fixed, "Contenido del resultado", configuration.resultado.contenido, {
        multiline: true,
        maxLength: 5000,
        onChange: (value) => {
          configuration.resultado.contenido = value;
        },
      });
      if (configuration.resultado.cta) {
        labelField(fixed, "Texto de la llamada a la acción", configuration.resultado.cta.texto, {
          maxLength: 300,
          onChange: (value) => {
            configuration.resultado.cta.texto = value;
          },
        });
        labelField(fixed, "Acción de la llamada a la acción", configuration.resultado.cta.accion, {
          maxLength: 500,
          onChange: (value) => {
            configuration.resultado.cta.accion = value;
          },
        });
        button(fixed, "Quitar llamada a la acción", () => {
          delete configuration.resultado.cta;
          render();
        });
      } else {
        button(fixed, "Añadir llamada a la acción", () => {
          configuration.resultado.cta = { texto: "", accion: "" };
          render();
        });
      }
    }

    const dimensionSection = section(
      fields,
      "custom-editor-questions custom-editor-config-section",
      "05",
      "Personalización",
      "Resultados por dimensión",
      "Opcional: redacta una explicación baja, media o alta para cada sección. Se selecciona por el porcentaje calculado.",
      "editor-dimension-heading",
    );
    configuration.personalizacion_dimension = Array.isArray(configuration.personalizacion_dimension)
      ? configuration.personalizacion_dimension
      : [];
    configuration.personalizacion_dimension.forEach((item, index) => {
      const fieldset = element("fieldset", "custom-editor-question");
      fieldset.append(element("legend", "", item.seccion || `Dimensión ${index + 1}`));
      labelField(fieldset, "Sección", item.seccion, {
        onChange: (value) => {
          item.seccion = value;
          fieldset.querySelector("legend").textContent = value || `Dimensión ${index + 1}`;
        },
      });
      for (const [nivel, titulo] of [["bajo", "Resultado bajo"], ["medio", "Resultado medio"], ["alto", "Resultado alto"]]) {
        labelField(fieldset, titulo, item[nivel], {
          multiline: true,
          maxLength: 5000,
          onChange: (value) => {
            item[nivel] = value;
          },
        });
      }
      button(fieldset, "Quitar dimensión", () => {
        configuration.personalizacion_dimension.splice(index, 1);
        render();
      });
      dimensionSection.append(fieldset);
    });
    button(dimensionSection, "Añadir dimensión", () => {
      configuration.personalizacion_dimension.push({
        seccion: configuration.secciones?.[0] || "Nueva dimensión",
        bajo: "Texto para nivel bajo",
        medio: "Texto para nivel medio",
        alto: "Texto para nivel alto",
      });
      render();
    });

    updatePreview();
  };

  scoringInput.addEventListener("change", () => setScoring(scoringInput.checked));
  document.getElementById("editor-scoring-continue").addEventListener("click", () => {
    scoringConfirmation.hidden = true;
    scoringInput.checked = false;
    setScoring(false, true);
  });
  document.getElementById("editor-scoring-cancel").addEventListener("click", () => {
    scoringConfirmation.hidden = true;
    scoringInput.checked = true;
  });
  let autosaveTimer = null;
  let autosaveRequestInFlight = false;
  let autosavePending = false;
  let autosaveRevision = 0;
  let createdDraftUrl = null;
  let createdDraftIsCurrent = false;
  const parseCreationResponse = async (response) => {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      if (!response.ok) {
        throw new Error(`No se pudo guardar el borrador (HTTP ${response.status}).`);
      }
      throw new Error(
        "El servidor devolvió una respuesta inesperada. Recarga el editor e inténtalo de nuevo.",
      );
    }

    let result;
    try {
      result = await response.json();
    } catch (_error) {
      throw new Error(
        "El servidor devolvió una respuesta JSON inválida. Inténtalo de nuevo.",
      );
    }
    if (!response.ok) {
      const errors = Array.isArray(result?.errors)
        ? result.errors.filter((error) => typeof error === "string" && error.trim())
        : [];
      throw new Error(
        errors.join(" ") || `No se pudo guardar el borrador (HTTP ${response.status}).`,
      );
    }
    if (!result || typeof result.redirect !== "string" || !result.redirect) {
      throw new Error(
        "El servidor no indicó dónde abrir el borrador guardado. Inténtalo de nuevo.",
      );
    }
    return result;
  };
  const sendAutosave = () => {
    if (autosaveRequestInFlight) {
      autosavePending = true;
      return;
    }
    autosaveRequestInFlight = true;
    autosavePending = false;
    if (isNewQuestionnaire) createdDraftIsCurrent = false;
    const requestRevision = autosaveRevision;
    syncSections();
    configuration.id = configuration.id || "";
    configuration.cliente = nameInput.value.trim();
    configuration.estado = "borrador";
    configurationInput.value = JSON.stringify(configuration);
    const payload = new URLSearchParams();
    payload.set("csrfmiddlewaretoken", form.querySelector("[name=csrfmiddlewaretoken]").value);
    payload.set("nombre", nameInput.value.trim());
    payload.set("configuracion", configurationInput.value);
    payload.set("intent", "save");
    fetch(form.action || window.location.href, {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
      body: payload,
    }).then(async (response) => {
      if (isNewQuestionnaire) {
        const result = await parseCreationResponse(response);
        createdDraftUrl = result.redirect;
        createdDraftIsCurrent = requestRevision === autosaveRevision;
        scoringError.hidden = true;
        return;
      }
      if (!response.ok) {
        throw new Error(
          `No se pudo guardar automáticamente (HTTP ${response.status}). Usa el botón Guardar.`,
        );
      }
    }).catch((error) => {
      scoringError.textContent = error instanceof TypeError
        ? "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
        : error.message || "No se pudo guardar automáticamente. Usa el botón Guardar.";
      scoringError.hidden = false;
      if (isNewQuestionnaire) createdDraftIsCurrent = false;
    }).finally(() => {
      autosaveRequestInFlight = false;
      if (autosavePending) {
        autosavePending = false;
        sendAutosave();
        return;
      }
      if (
        autosaveTimer === null &&
        isNewQuestionnaire &&
        createdDraftUrl &&
        createdDraftIsCurrent
      ) {
        window.location.assign(createdDraftUrl);
      }
    });
  };
  const scheduleAutosave = () => {
    autosaveRevision += 1;
    if (isNewQuestionnaire) createdDraftIsCurrent = false;
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      sendAutosave();
    }, 1800);
  };
  root.addEventListener("input", scheduleAutosave);
  root.addEventListener("change", scheduleAutosave);
  form.addEventListener("submit", (event) => {
    syncSections();
    configuration.id = configuration.id || "";
    configuration.cliente = nameInput.value.trim();
    configuration.estado = "borrador";
    configurationInput.value = JSON.stringify(configuration);
    if (!isNewQuestionnaire || event.submitter?.value === "preview") return;
    event.preventDefault();
    window.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    autosaveRevision += 1;
    createdDraftIsCurrent = false;
    if (autosaveRequestInFlight) {
      autosavePending = true;
    } else {
      sendAutosave();
    }
  });
  render();
})();
