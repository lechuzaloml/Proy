(() => {
  const form = document.querySelector("[data-question-flow]");
  if (!form) return;

  const steps = Array.from(form.querySelectorAll("[data-flow-step]"));
  const questions = steps.filter((step) => step.hasAttribute("data-question-index"));
  const error = form.querySelector("[data-flow-error]");
  const answersField = form.querySelector('input[name="respuestas"]');
  let current = form.querySelector(".questionnaire-intro")?.hidden ? 1 : 0;

  function showStep(index, scrollToStep = true) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, stepIndex) => {
      step.hidden = stepIndex !== current;
    });
    const activeQuestion = steps[current].getAttribute("data-question-index");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    if (activeQuestion !== null) {
      const progress = steps[current].querySelector("[data-progress-text]");
      if (progress) progress.setAttribute("aria-current", "step");
    }
    const activeStep = steps[current];
    activeStep
      .querySelector('input:not([type="hidden"]), textarea, button, h2, h3')
      ?.focus({ preventScroll: true });
    if (scrollToStep) {
      activeStep.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function currentAnswer(index) {
    const inputs = Array.from(form.querySelectorAll(`[data-answer-input][data-question-index="${index}"]`));
    if (!inputs.length) return null;
    const type = inputs[0].dataset.answerType;
    if (type === "opcion_multiple") {
      const selected = inputs.find((input) => input.checked);
      return selected ? { tipo: type, indiceOpcion: Number(selected.value) } : null;
    }
    if (type === "escala") {
      const selected = inputs.find((input) => input.type === "radio" && input.checked);
      if (selected) return { tipo: type, valor: Number(selected.value) };
      const range = inputs.find((input) => input.type === "range");
      if (!range) return null;
      return range.dataset.touched === "true"
        ? { tipo: type, valor: Number(range.value) }
        : null;
    }
    const value = inputs[0].value.trim();
    return value ? { tipo: type, valor: value } : null;
  }

  function serializeAnswers() {
    const answers = {};
    for (const step of questions) {
      const index = Number(step.dataset.questionIndex);
      const answer = currentAnswer(index);
      if (!answer) return null;
      answers[String(index)] = answer;
    }
    answersField.value = JSON.stringify(answers);
    return answers;
  }

  form.querySelectorAll("[data-flow-next]").forEach((button) => {
    button.addEventListener("click", () => {
      const step = steps[current];
      if (step.hasAttribute("data-question-index")) {
        const answer = currentAnswer(Number(step.dataset.questionIndex));
        if (!answer) {
          error.textContent = "Responde esta pregunta para continuar.";
          error.hidden = false;
          step.querySelector("[data-answer-input]")?.focus();
          return;
        }
      }
      if (step.classList.contains("contact-form-view")) {
        const invalidField = Array.from(step.querySelectorAll("input[required]"))
          .find((input) => !input.checkValidity());
        if (invalidField) {
          if (invalidField.type === "checkbox") {
            error.textContent = "Debes aceptar el aviso de privacidad para continuar.";
          } else if (invalidField.validity.typeMismatch) {
            error.textContent = "Ingresa un correo electrónico válido.";
          } else if (invalidField.validity.tooShort) {
            error.textContent = "Revisa la longitud de este dato antes de continuar.";
          } else {
            error.textContent = "Completa tus datos de contacto para continuar.";
          }
          error.hidden = false;
          invalidField.focus();
          return;
        }
      }
      showStep(current + 1);
    });
  });

  form.querySelectorAll("[data-flow-previous]").forEach((button) => {
    button.addEventListener("click", () => showStep(current - 1));
  });

  form.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "radio") return;
    if (!input.matches("[data-answer-input]")) return;
    form.querySelectorAll(`input[type="radio"][name="${input.name}"]`).forEach((choice) => {
      const label = choice.closest("label");
      if (label) {
        label.classList.toggle(
          input.dataset.answerType === "escala" ? "scale-choice-selected" : "option-selected",
          choice.checked,
        );
      }
    });
  });

  form.querySelectorAll('input[type="range"][data-answer-input]').forEach((range) => {
    const markTouched = () => {
      range.dataset.touched = "true";
      const output = range.parentElement.querySelector("[data-scale-output]");
      if (output) output.value = range.value;
    };
    range.addEventListener("input", markTouched);
    range.addEventListener("pointerdown", markTouched);
    range.addEventListener("keydown", markTouched);
  });

  form.addEventListener("submit", (event) => {
    if (!serializeAnswers()) {
      event.preventDefault();
      error.textContent = "Responde todas las preguntas para continuar.";
      error.hidden = false;
      const unanswered = questions.find((step) => !currentAnswer(Number(step.dataset.questionIndex)));
      if (unanswered) showStep(steps.indexOf(unanswered));
      return;
    }
    const consent = form.querySelector('input[name="consentimiento"]');
    if (consent && !consent.checked) {
      event.preventDefault();
      error.textContent = "Debes aceptar el aviso de privacidad para continuar.";
      error.hidden = false;
      return;
    }
  });

  showStep(current, false);
})();
