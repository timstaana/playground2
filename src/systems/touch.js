window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.ensureTouchState = function ensureTouchState() {
  const state = Game.systems.inputState;
  if (!state.touch) {
    state.touch = {
      active: false,
      id: null,
      origin: { x: 0, y: 0 },
      pos: { x: 0, y: 0 },
      value: { x: 0, y: 0 },
      knob: { x: 0, y: 0 },
      radius: 60,
      deadZone: 0.12,
      dragThreshold: 10,
      jumpId: null,
      multiTouch: false,
      pending: new Map(),
    };
  }
  if (!state.touch.pending) {
    state.touch.pending = new Map();
  }
  return state.touch;
};

Game.systems.readTouchPoints = function readTouchPoints(event) {
  const points = [];
  if (event && typeof event.pointerId === "number") {
    if (event.pointerType === "mouse") {
      return points;
    }
    points.push({
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    });
    return points;
  }
  if (event && event.changedTouches && event.changedTouches.length) {
    for (const touch of event.changedTouches) {
      points.push({
        id: touch.identifier ?? touch.id ?? 0,
        x: touch.clientX,
        y: touch.clientY,
      });
    }
    return points;
  }
  if (typeof touches !== "undefined" && Array.isArray(touches)) {
    for (const touch of touches) {
      points.push({
        id: touch.identifier ?? touch.id ?? 0,
        x: touch.x,
        y: touch.y,
      });
    }
  }
  return points;
};

Game.systems.handleTouchStart = function handleTouchStart(event) {
  const state = Game.systems.inputState;
  const touchState = Game.systems.ensureTouchState();
  const now = Date.now();
  if (event && typeof event.pointerId === "number") {
    state.pointerActive = true;
    state.lastPointerTime = now;
  } else if (state.pointerActive && now - state.lastPointerTime < 120) {
    return false;
  }
  state.lastTouchTime = Date.now();
  const points = Game.systems.readTouchPoints(event);
  for (const point of points) {
    if (!touchState.active && touchState.pending.size > 0) {
      if (touchState.jumpId === null) {
        touchState.jumpId = point.id;
        touchState.jumpPos = { x: point.x, y: point.y };
        state.touchJumpQueued = true;
        touchState.multiTouch = true;
        continue;
      }
    }
    if (touchState.active) {
      if (touchState.jumpId === null) {
        touchState.jumpId = point.id;
        state.touchJumpQueued = true;
        touchState.jumpPos = { x: point.x, y: point.y };
        touchState.multiTouch = true;
      } else {
        touchState.multiTouch = true;
        touchState.pending.set(point.id, {
          x: point.x,
          y: point.y,
          time: Date.now(),
        });
      }
      continue;
    }
    touchState.pending.set(point.id, {
      x: point.x,
      y: point.y,
      time: Date.now(),
    });
  }
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  return false;
};

Game.systems.handleTouchMove = function handleTouchMove(event) {
  const state = Game.systems.inputState;
  const touchState = Game.systems.ensureTouchState();
  const now = Date.now();
  if (event && typeof event.pointerId === "number") {
    state.pointerActive = true;
    state.lastPointerTime = now;
  } else if (state.pointerActive && now - state.lastPointerTime < 120) {
    return false;
  }
  const points = Game.systems.readTouchPoints(event);
  const threshold = touchState.dragThreshold ?? 10;

  for (const point of points) {
    if (touchState.active && point.id === touchState.id) {
      touchState.pos.x = point.x;
      touchState.pos.y = point.y;
      continue;
    }
    if (touchState.jumpId === point.id && touchState.jumpPos) {
      touchState.jumpPos.x = point.x;
      touchState.jumpPos.y = point.y;
      continue;
    }
    const pending = touchState.pending.get(point.id);
    if (!pending) {
      continue;
    }
    if (!touchState.active) {
      const dx = point.x - pending.x;
      const dy = point.y - pending.y;
      if (Math.hypot(dx, dy) >= threshold) {
        touchState.active = true;
        touchState.id = point.id;
        touchState.origin.x = pending.x;
        touchState.origin.y = pending.y;
        touchState.pos.x = point.x;
        touchState.pos.y = point.y;
        touchState.pending.delete(point.id);
      }
    }
  }
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  return false;
};

Game.systems.handleTouchEnd = function handleTouchEnd(event) {
  const state = Game.systems.inputState;
  const touchState = Game.systems.ensureTouchState();
  const now = Date.now();
  if (event && typeof event.pointerId === "number") {
    state.pointerActive = true;
    state.lastPointerTime = now;
  } else if (state.pointerActive && now - state.lastPointerTime < 120) {
    return false;
  }
  state.lastTouchTime = Date.now();
  const points = Game.systems.readTouchPoints(event);
  const threshold = touchState.dragThreshold ?? 10;

  for (const point of points) {
    if (touchState.active && point.id === touchState.id) {
      touchState.active = false;
      touchState.id = null;
      touchState.pos.x = touchState.origin.x;
      touchState.pos.y = touchState.origin.y;
      continue;
    }
    if (point.id === touchState.jumpId) {
      touchState.jumpId = null;
      touchState.jumpPos = null;
      continue;
    }
    const pending = touchState.pending.get(point.id);
    if (pending) {
      const dx = point.x - pending.x;
      const dy = point.y - pending.y;
      const moved = Math.hypot(dx, dy);
      if (moved < threshold && !touchState.multiTouch) {
        state.clickRequested = true;
        state.clickPosition = { x: point.x, y: point.y };
      }
      touchState.pending.delete(point.id);
    }
  }
  if (
    !touchState.active &&
    touchState.jumpId === null &&
    touchState.pending.size === 0
  ) {
    touchState.multiTouch = false;
  }
  if (event && typeof event.preventDefault === "function") {
    event.preventDefault();
  }
  return false;
};

Game.systems.attachTouchEvents = function attachTouchEvents(element) {
  if (!element || element.__touchHandlersAttached) {
    return;
  }
  element.__touchHandlersAttached = true;
  const opts = { passive: false };
  element.addEventListener(
    "pointerdown",
    (event) => Game.systems.handleTouchStart(event),
    opts
  );
  element.addEventListener(
    "pointermove",
    (event) => Game.systems.handleTouchMove(event),
    opts
  );
  element.addEventListener(
    "pointerup",
    (event) => Game.systems.handleTouchEnd(event),
    opts
  );
  element.addEventListener(
    "pointercancel",
    (event) => Game.systems.handleTouchEnd(event),
    opts
  );
};
