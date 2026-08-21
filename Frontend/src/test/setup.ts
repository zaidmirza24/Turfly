import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * Pointer Events shims for Radix.
 *
 * Every interactive primitive in this app (dropdown menus, dialogs, selects,
 * popovers) comes from Radix, which drives its open/close behaviour through the
 * Pointer Events API and pointer capture. jsdom implements neither, so those
 * components render their trigger and then never open under test — which looks
 * exactly like a broken component and would otherwise make all of them
 * untestable.
 *
 * These are environment gaps, not behaviour being faked: the assertions still
 * exercise the real Radix code paths.
 */
if (typeof window.PointerEvent === "undefined") {
  // jsdom ships MouseEvent but not PointerEvent; Radix constructs the latter.
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 1;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof PointerEvent;
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

// Radix scrolls the focused item into view when a menu opens.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
