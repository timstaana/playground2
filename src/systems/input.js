window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.inputState = {
  jumpHeld: false,
  spacePressed: false,
  clickRequested: false,
};

Game.systems.inputSystem = function inputSystem(worldRef) {
  const turn = (keyIsDown("d") ? 1 : 0) - (keyIsDown("a") ? 1 : 0);
  const throttle = (keyIsDown("w") ? 1 : 0) - (keyIsDown("s") ? 1 : 0);
  const jumpDown = keyIsDown("Space");
  const spacePressed = jumpDown && !Game.systems.inputState.jumpHeld;
  Game.systems.inputState.jumpHeld = jumpDown;
  Game.systems.inputState.spacePressed = spacePressed;

  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    move.turn = turn;
    move.throttle = throttle;

    if (spacePressed) {
      move.jumpRequested = true;
    }

    worldRef.components.MoveIntent.set(entity, move);
  }
};
