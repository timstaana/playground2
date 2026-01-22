window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.inputState = {
  jumpHeld: false,
};

Game.systems.inputSystem = function inputSystem(worldRef) {
  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    const turn = (keyIsDown("d") ? 1 : 0) - (keyIsDown("a") ? 1 : 0);
    const throttle = (keyIsDown("w") ? 1 : 0) - (keyIsDown("s") ? 1 : 0);
    move.turn = turn;
    move.throttle = throttle;

    const jumpDown = keyIsDown("Space");
    if (jumpDown && !Game.systems.inputState.jumpHeld) {
      move.jumpRequested = true;
    }
    Game.systems.inputState.jumpHeld = jumpDown;

    worldRef.components.MoveIntent.set(entity, move);
  }
};
