const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scriptPath = path.join(
  __dirname,
  "..",
  "static",
  "funnels",
  "publication-limit.js",
);
const script = readFileSync(scriptPath, "utf8");

class MockElement {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  click(event = {}) {
    const listener = this.listeners.get("click");
    if (listener) listener({ preventDefault() {}, ...event });
  }
}

class MockDialog extends MockElement {
  constructor(autoOpen = "false") {
    super();
    this.dataset = { autoOpen };
    this.open = false;
    this.showModalCalls = 0;
    this.closeCalls = 0;
    this.closeButton = new MockElement();
  }

  querySelector() {
    return this.closeButton;
  }

  showModal() {
    this.open = true;
    this.showModalCalls += 1;
  }

  close() {
    this.open = false;
    this.closeCalls += 1;
  }
}

function createPage(autoOpen = "false") {
  const dialog = new MockDialog(autoOpen);
  const trigger = new MockElement();
  const document = {
    querySelector: () => dialog,
    querySelectorAll: () => [trigger],
  };
  vm.runInNewContext(script, {
    document,
    HTMLDialogElement: MockDialog,
  });
  return { dialog, trigger };
}

test("clicking publish at the quota opens the modal without submitting", () => {
  const page = createPage();
  let prevented = false;

  page.trigger.click({
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(page.dialog.open, true);
  assert.equal(page.dialog.showModalCalls, 1);

  page.dialog.closeButton.click();
  assert.equal(page.dialog.open, false);
  assert.equal(page.dialog.closeCalls, 1);
});

test("a server-rejected publication opens the modal on page load", () => {
  const page = createPage("true");

  assert.equal(page.dialog.open, true);
  assert.equal(page.dialog.showModalCalls, 1);
});
