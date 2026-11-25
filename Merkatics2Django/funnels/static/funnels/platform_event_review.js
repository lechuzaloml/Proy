document.querySelectorAll("[data-platform-event-review]").forEach((card) => {
  const details = card.querySelector(".platform-event-review__reject-toggle");
  const form = card.querySelector("[data-rejection-form]");
  const reason = card.querySelector("[data-rejection-reason]");
  const clientError = card.querySelector("[data-rejection-client-error]");
  const submitButton = card.querySelector("[data-rejection-submit]");
  const cancelButton = card.querySelector("[data-rejection-cancel]");
  const processing = card.querySelector("[data-rejection-processing]");

  if (!details || !form || !reason || !clientError || !submitButton) {
    return;
  }

  reason.addEventListener("input", () => {
    if (reason.value.trim()) {
      clientError.hidden = true;
    }
  });

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      details.open = false;
      details.querySelector("summary").focus();
    });
  }

  form.addEventListener("submit", (event) => {
    if (form.dataset.submitting === "true") {
      event.preventDefault();
      return;
    }
    if (!reason.value.trim()) {
      event.preventDefault();
      clientError.hidden = false;
      reason.focus();
      return;
    }

    form.dataset.submitting = "true";
    submitButton.disabled = true;
    if (cancelButton) {
      cancelButton.disabled = true;
    }
    if (processing) {
      processing.hidden = false;
    }
  });
});
