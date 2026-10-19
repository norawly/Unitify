import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function map() {
  const sandbox = { window: { requestIdleCallback() {} }, document: { currentScript: null }, requestIdleCallback() {} };
  vm.runInNewContext(readFileSync(new URL("../public/map.js", import.meta.url), "utf8"), sandbox);
  const listeners = new Map(), captured = new Set();
  let box = [0, 0, 1000, 500];
  const svg = {
    addEventListener(name, fn) { listeners.set(name, fn); },
    getBoundingClientRect() { return { left: 100, top: 50, width: 1000, height: 500 }; },
    setPointerCapture(id) { captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); },
  };
  const reset = sandbox.attachMapGestures(svg, () => box, value => { box = Array.from(value); }, () => 1600);
  function fire(type, id, x, y, extra = {}) {
    const event = { pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0, target: svg,
      prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
    listeners.get(type)?.(event);
    return event;
  }
  return { fire, reset, get box() { return box; }, listeners };
}

function near(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((n, i) => assert.ok(Math.abs(n - expected[i]) < 1e-7, `${actual} ≠ ${expected}`));
}

test("pinching preserves the map point between the two fingers instead of jumping to the viewport center", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointerdown", 2, 700, 250);
  near(m.box, [0, 0, 1000, 500]);
  m.fire("pointermove", 1, 200, 250);
  m.fire("pointermove", 2, 800, 250);
  near(m.box, [400 / 3, 200 / 3, 2000 / 3, 1000 / 3]);
  // Legacy touch handlers must not compete with the pointer gesture.
  assert.equal(m.listeners.has("touchmove"), false);
});

test("switching from dragging to pinch and back to one finger keeps the current scale and position", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointermove", 1, 350, 275);
  near(m.box, [-50, -25, 1000, 500]);
  m.fire("pointerdown", 2, 750, 275);
  near(m.box, [-50, -25, 1000, 500]);
  m.fire("pointermove", 2, 950, 275);
  const pinched = m.box.slice();
  m.fire("pointerup", 2, 950, 275);
  near(m.box, pinched);
  m.fire("pointermove", 1, 360, 280);
  near(m.box, [pinched[0] - 10 * pinched[2] / 1000, pinched[1] - 5 * pinched[3] / 500, pinched[2], pinched[3]]);
});

test("two fingers can pan together without changing zoom", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointerdown", 2, 700, 250);
  m.fire("pointermove", 1, 350, 300);
  m.fire("pointermove", 2, 750, 300);
  near(m.box, [-50, -50, 1000, 500]);
});

test("cancelled gestures and closing the map do not leave a stuck drag", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointercancel", 1, 300, 250);
  m.fire("pointermove", 1, 900, 400);
  near(m.box, [0, 0, 1000, 500]);
  m.fire("pointerdown", 2, 300, 250);
  m.reset();
  m.fire("pointermove", 2, 900, 400);
  near(m.box, [0, 0, 1000, 500]);
});

test("map drags do not select a random room, while a simple tap still can", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointermove", 1, 350, 250);
  m.fire("pointerup", 1, 350, 250);
  assert.equal(m.fire("click").stopped, true);
  m.fire("pointerdown", 2, 350, 250);
  m.fire("pointerup", 2, 350, 250);
  assert.equal(m.fire("click").stopped, false);
});

test("zoom limits remain finite and preserve the aspect ratio", () => {
  const m = map();
  m.fire("pointerdown", 1, 300, 250);
  m.fire("pointerdown", 2, 700, 250);
  m.fire("pointermove", 2, 300, 250);
  assert.equal(m.box[2], 1600);
  assert.equal(m.box[3], 800);
  m.fire("pointermove", 2, 1000000, 250);
  assert.equal(m.box[2], 24);
  assert.equal(m.box[3], 12);
  assert.ok(m.box.every(Number.isFinite));
});

test("trackpad zoom anchors at the cursor and does not interfere with an active touch gesture", () => {
  const m = map();
  m.fire("wheel", undefined, 300, 250, { deltaY: -10, deltaMode: 0, ctrlKey: true });
  const box = m.box.slice();
  near([box[0] + 0.2 * box[2], box[1] + 0.4 * box[3]], [200, 200]);
  m.fire("pointerdown", 1, 300, 250);
  m.fire("wheel", undefined, 300, 250, { deltaY: -10, deltaMode: 0 });
  near(m.box, box);
});
