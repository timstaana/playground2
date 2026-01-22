window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.movementSystem = function movementSystem(worldRef, dt) {
  const playerId = worldRef.resources.playerId;
  const cameraId = worldRef.resources.cameraId;
  const rig =
    cameraId && worldRef.components.CameraRig.has(cameraId)
      ? worldRef.components.CameraRig.get(cameraId)
      : null;
  const rigYaw = rig ? rig.yaw : null;
  for (const [entity, move] of worldRef.components.MoveIntent.entries()) {
    const vel = worldRef.components.Velocity.get(entity);
    const transform = worldRef.components.Transform.get(entity);
    const speed = worldRef.components.Speed.get(entity)?.value ?? 0;

    let baseYaw = transform.rotY;
    if (entity === playerId && rigYaw !== null) {
      baseYaw = rigYaw;
    }

    if (move.throttle !== 0) {
      const forward = {
        x: Math.sin(baseYaw),
        z: -Math.cos(baseYaw),
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

    if (entity === playerId && rigYaw !== null && rig) {
      if (move.throttle > 0.01) {
        rig.facingDir = 1;
      } else if (move.throttle < -0.01) {
        rig.facingDir = -1;
      }
      const facingDir = rig.facingDir ?? 1;
      transform.rotY = facingDir < 0 ? baseYaw + Math.PI : baseYaw;
      worldRef.components.CameraRig.set(cameraId, rig);
    }

    worldRef.components.Velocity.set(entity, vel);
    worldRef.components.Transform.set(entity, transform);
    worldRef.components.MoveIntent.set(entity, move);
  }
};
