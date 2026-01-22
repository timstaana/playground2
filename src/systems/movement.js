window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.movementSystem = function movementSystem(worldRef, dt) {
  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    const transform = worldRef.components.Transform.get(entity);
    const speed = worldRef.components.Speed.get(entity)?.value ?? 0;

    if (move.throttle !== 0) {
      const forward = {
        x: Math.sin(transform.rotY),
        z: -Math.cos(transform.rotY),
      };
      vel.x = forward.x * speed * move.throttle;
      vel.z = forward.z * speed * move.throttle;
    } else {
      vel.x = 0;
      vel.z = 0;
    }

    if (move.jumpRequested && move.grounded) {
      const jump = worldRef.components.Jump.get(entity);
      vel.y = jump.velocity;
      move.grounded = false;
    }
    move.jumpRequested = false;

    worldRef.components.Velocity.set(entity, vel);
    worldRef.components.Transform.set(entity, transform);
    worldRef.components.MoveIntent.set(entity, move);
  }
};
