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
  "event_popup_carousel.js",
);
const cssPath = path.join(
  __dirname,
  "..",
  "static",
  "funnels",
  "index.css",
);
const templatePath = path.join(
  __dirname,
  "..",
  "templates",
  "funnels",
  "_event_popup_carousel.html",
);
const headerTemplatePath = path.join(
  __dirname,
  "..",
  "templates",
  "funnels",
  "_public_header.html",
);
const basePublicTemplatePath = path.join(
  __dirname,
  "..",
  "templates",
  "funnels",
  "base_public.html",
);
const script = readFileSync(scriptPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const template = readFileSync(templatePath, "utf8");
const headerTemplate = readFileSync(headerTemplatePath, "utf8");
const basePublicTemplate = readFileSync(basePublicTemplatePath, "utf8");

class MockElement {
  constructor({ dataset = {}, id = "", hidden = false, type = "" } = {}) {
    this.dataset = dataset;
    this.id = id;
    this.hidden = hidden;
    this.type = type;
    this.disabled = false;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.style = {};
    this.textContent = "";
    this.closest = () => null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  append(element) {
    this.children.push(element);
  }

  focus() {}

  click() {
    for (const listener of this.listeners.get("click") || []) {
      listener({ target: this, preventDefault() {} });
    }
  }

  querySelector(selector) {
    if (selector === "h2") return this.title || null;
    if (selector === "a, button" || selector === "button, a[href]") {
      return this.actions[0] || null;
    }
    return null;
  }
}

class MockHTMLElement extends MockElement {}

function createStorage(values = {}) {
  const data = new Map(Object.entries(values));
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

function createPage(sessionStorage = createStorage(), includeCarousel = true) {
  const links = [];
  const closeButtons = [];
  const headerStart = new MockHTMLElement();
  const slides = ["general", "workspace:empresa-a", "workspace:empresa-b"].map(
    (popupKey) => {
      const link = new MockHTMLElement({
        dataset: { popupReturnKey: popupKey },
      });
      links.push(link);
      const close = new MockHTMLElement({ type: "button" });
      closeButtons.push(close);
      const slide = new MockHTMLElement({
        dataset: { popupKey },
        hidden: true,
      });
      slide.title = new MockHTMLElement();
      slide.actions = [close, link];
      return slide;
    },
  );
  const count = new MockElement();
  const indicators = new MockElement();
  const previous = new MockHTMLElement({ type: "button" });
  const next = new MockHTMLElement({ type: "button" });
  const carousel = new MockHTMLElement({ hidden: true });
  carousel.querySelector = (selector) => {
    if (selector === "[data-popup-count]") return count;
    if (selector === "[data-popup-indicators]") return indicators;
    if (selector === "[data-popup-previous]") return previous;
    if (selector === "[data-popup-next]") return next;
    return null;
  };
  carousel.querySelectorAll = (selector) => {
    if (selector === "[data-popup-slide]") return slides;
    if (selector === "[data-popup-close]") return closeButtons;
    if (selector === "[data-popup-return-key]") return links;
    return [];
  };
  const body = new MockHTMLElement();
  body.style.overflow = "auto";
  const document = {
    activeElement: body,
    body,
    querySelector: (selector) =>
      selector === "[data-popup-carousel]" && includeCarousel ? carousel : null,
    querySelectorAll: (selector) =>
      selector === "[data-popup-reset]" ? [headerStart] : [],
    createElement: () => new MockHTMLElement(),
    addEventListener() {},
    removeEventListener() {},
  };
  const window = {
    sessionStorage,
    location: { reload() { this.reloaded = true; } },
    matchMedia: () => ({ matches: true }),
    setTimeout(callback) {
      callback();
    },
  };

  vm.runInNewContext(script, {
    document,
    window,
    HTMLElement: MockHTMLElement,
  });

  return {
    body,
    carousel,
    closeButtons,
    count,
    headerStart,
    links,
    sessionStorage,
    slides,
    window,
  };
}

test("the close controls hide the carousel without reloading the page", () => {
  for (const closeButtonIndex of [0, 1]) {
    const page = createPage();
    assert.equal(page.carousel.hidden, false);

    page.closeButtons[closeButtonIndex].click();

    assert.equal(page.carousel.hidden, true);
    assert.equal(page.window.location.reloaded, undefined);
    assert.equal(
      page.sessionStorage.getItem("event-popup-carousel-dismissed-v2"),
      "1",
    );
    assert.equal(page.body.style.overflow, "auto");
  }

  assert.match(template, /data-popup-close[^>]*type="button"/);
  assert.match(template, /No gracias<\/button>/);
});

test("reservation navigation restores the exact company slide across reloads", () => {
  const storage = createStorage();
  const firstLanding = createPage(storage);
  firstLanding.links[2].click();

  assert.equal(storage.getItem("event-popup-carousel-dismissed-v2"), null);
  assert.equal(
    storage.getItem("event-popup-carousel-return"),
    "workspace:empresa-b",
  );

  const returnedLanding = createPage(storage);
  assert.equal(returnedLanding.count.textContent, "3 / 3");
  assert.equal(returnedLanding.slides[0].hidden, true);
  assert.equal(returnedLanding.slides[1].hidden, true);
  assert.equal(returnedLanding.slides[2].hidden, false);

  const refreshedLanding = createPage(storage);
  assert.equal(refreshedLanding.count.textContent, "3 / 3");
  assert.equal(refreshedLanding.slides[2].hidden, false);

  refreshedLanding.closeButtons[1].click();
  assert.equal(storage.getItem("event-popup-carousel-return"), null);
  assert.equal(createPage(storage).carousel.hidden, true);
});

test("the header sign-in button resets dismissal so popups return to the landing page", () => {
  const storage = createStorage({
    "event-popup-carousel-dismissed-v2": "1",
  });
  const publicPage = createPage(storage, false);

  publicPage.headerStart.click();
  assert.equal(storage.getItem("event-popup-carousel-dismissed-v2"), null);

  const returnedLanding = createPage(storage);
  assert.equal(returnedLanding.carousel.hidden, false);
  assert.equal(returnedLanding.count.textContent, "1 / 3");
  assert.match(headerTemplate, /data-popup-reset[^>]*type="submit">Iniciar sesión/);
  assert.match(basePublicTemplate, /static 'funnels\/event_popup_carousel\.js'/);
});

test("general and different company reservations restore their own slides", () => {
  for (const [slideIndex, popupKey] of [
    [0, "general"],
    [1, "workspace:empresa-a"],
    [2, "workspace:empresa-b"],
  ]) {
    const storage = createStorage();
    createPage(storage).links[slideIndex].click();
    const returnedPage = createPage(storage);

    assert.equal(
      storage.getItem("event-popup-carousel-return"),
      popupKey,
    );
    assert.equal(returnedPage.count.textContent, `${slideIndex + 1} / 3`);
    returnedPage.slides.forEach((slide, index) => {
      assert.equal(slide.hidden, index !== slideIndex);
    });
  }
});

test("the legacy load-time seen marker does not suppress the carousel", () => {
  const page = createPage(
    createStorage({ "event-popup-carousel-seen": "1" }),
  );

  assert.equal(page.carousel.hidden, false);
  assert.equal(page.count.textContent, "1 / 3");
});

test("popup controls have explicit centered alignment and hidden states are honored", () => {
  const closeButton = css.match(/\.promo-modal-close\s*\{([^}]*)\}/s);
  const dismissButton = css.match(/\.promo-modal-secondary\s*\{([^}]*)\}/s);

  assert.ok(closeButton);
  assert.match(closeButton[1], /display:\s*grid/);
  assert.match(closeButton[1], /place-items:\s*center/);
  assert.match(closeButton[1], /position:\s*absolute/);
  assert.match(closeButton[1], /width:\s*2\.25rem/);
  assert.match(closeButton[1], /height:\s*2\.25rem/);

  assert.ok(dismissButton);
  assert.match(dismissButton[1], /display:\s*flex/);
  assert.match(dismissButton[1], /align-items:\s*center/);
  assert.match(dismissButton[1], /justify-content:\s*center/);
  assert.match(dismissButton[1], /min-height:\s*2\.8rem/);
  assert.match(dismissButton[1], /text-align:\s*center/);

  assert.match(
    css,
    /\.promo-modal-backdrop\[hidden\][\s\S]*?display:\s*none/,
  );
  const mobileRules = css.match(/@media \(max-width: 640px\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(mobileRules);
  assert.doesNotMatch(
    mobileRules[1],
    /\.promo-modal-(?:close|secondary)/,
  );
  assert.match(template, /data-popup-key="workspace:\{\{ popup\.workspace\.slug \}\}"/);
  assert.match(
    template,
    /href="\{% url 'registro_evento' popup\.workspace\.slug %\}"/,
  );
  assert.match(
    template,
    /href="\{% url 'registro_evento_general' %\}"/,
  );
  assert.doesNotMatch(
    template,
    /registro_evento' event_popups\.0\.workspace\.slug/,
  );
});
