window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.inputState = {
  jumpHeld: false,
  spacePressed: false,
  clickRequested: false,
  clickPosition: null,
  touchJumpQueued: false,
  touchJumpPressed: false,
  lastTouchTime: 0,
  lastPointerTime: 0,
  pointerActive: false,
  touch: {
    active: false,
    id: null,
    origin: { x: 0, y: 0 },
    pos: { x: 0, y: 0 },
    value: { x: 0, y: 0 },
    knob: { x: 0, y: 0 },
    radius: 70,
    deadZone: 0.12,
    deadZoneX: 0.12,
    deadZoneY: 0.48,
    dragThreshold: 10,
    jumpId: null,
    pending: new Map(),
  },
};

Game.systems.inputSystem = function inputSystem(worldRef) {
  const state = Game.systems.inputState;
  const turnKeys = ((keyIsDown(RIGHT_ARROW) || keyIsDown("d")) ? 1 : 0) - (keyIsDown(LEFT_ARROW) || (keyIsDown("a")) ? 1 : 0);
  const throttleKeys = ((keyIsDown(UP_ARROW) || keyIsDown("w")) ? 1 : 0) - ((keyIsDown(DOWN_ARROW) || keyIsDown("s")) ? 1 : 0);
  const jumpDown = keyIsDown("Space");
  const touchJump = !!state.touchJumpQueued;
  const spacePressed = (jumpDown && !state.jumpHeld) || touchJump;
  state.jumpHeld = jumpDown;
  state.spacePressed = spacePressed;
  state.touchJumpPressed = touchJump;
  state.touchJumpQueued = false;

  let turn = turnKeys;
  let throttle = throttleKeys;

  const touch = state.touch;
  if (touch && touch.active) {
    const dx = touch.pos.x - touch.origin.x;
    const dy = touch.pos.y - touch.origin.y;
    const dist = Math.hypot(dx, dy);
    const radius = touch.radius || 1;
    const scale = dist > radius ? radius / dist : 1;
    let nx = (dx * scale) / radius;
    let ny = (dy * scale) / radius;
    const deadZone = touch.deadZone ?? 0.12;
    const deadZoneX = touch.deadZoneX ?? deadZone;
    const deadZoneY = touch.deadZoneY ?? deadZone;
    if (Math.abs(nx) < deadZoneX) {
      nx = 0;
    }
    if (Math.abs(ny) < deadZoneY) {
      ny = 0;
    }
    touch.value.x = nx;
    touch.value.y = ny;
    touch.knob.x = touch.origin.x + dx * scale;
    touch.knob.y = touch.origin.y + dy * scale;

    turn = Math.max(-1, Math.min(1, nx));
    throttle = Math.max(-1, Math.min(1, -ny));
  } else if (touch) {
    touch.value.x = 0;
    touch.value.y = 0;
    touch.knob.x = touch.origin.x;
    touch.knob.y = touch.origin.y;
  }

  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    move.turn = turn;
    move.throttle = throttle;

    if (spacePressed) {
      move.jumpRequested = true;
    }

    worldRef.components.MoveIntent.set(entity, move);
  }
};
