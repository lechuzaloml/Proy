(() => {
  const dialog = document.querySelector("[data-publication-limit-dialog]");
  if (!(dialog instanceof HTMLDialogElement)) return;

  const openDialog = () => {
    if (!dialog.open) dialog.showModal();
  };

  document
    .querySelectorAll("[data-publication-limit-trigger]")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        openDialog();
      });
    });

  const closeButton = dialog.querySelector("[data-publication-limit-close]");
  closeButton.addEventListener("click", () => dialog.close());

  if (dialog.dataset.autoOpen === "true") openDialog();
})();
