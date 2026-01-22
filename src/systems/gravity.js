window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.gravitySystem = function gravitySystem(worldRef, dt) {
  for (const [entity, gravity] of worldRef.components.Gravity.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    vel.y -= gravity.value * dt;
    worldRef.components.Velocity.set(entity, vel);
  }
};
