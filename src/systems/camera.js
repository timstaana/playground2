window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.cameraSystem = function cameraSystem(worldRef) {
  for (const [entity, follow] of worldRef.components.CameraFollow.entries()) {
    const targetTransform = worldRef.components.Transform.get(follow.target);
    const cameraTransform = worldRef.components.Transform.get(entity);
    const rig = worldRef.components.CameraRig.get(entity);
    if (!targetTransform || !cameraTransform) {
      continue;
    }

    const yaw = rig ? rig.yaw : targetTransform.rotY;
    const forward = {
      x: Math.sin(yaw),
      z: -Math.cos(yaw),
    };
    const right = {
      x: Math.cos(yaw),
      z: Math.sin(yaw),
    };

    const desired = {
      x: targetTransform.pos.x - forward.x * follow.distance + right.x * follow.side,
      y: targetTransform.pos.y + follow.height,
      z: targetTransform.pos.z - forward.z * follow.distance + right.z * follow.side,
    };

    cameraTransform.pos.x = lerp(cameraTransform.pos.x, desired.x, follow.smooth);
    cameraTransform.pos.y = lerp(cameraTransform.pos.y, desired.y, follow.smooth);
    cameraTransform.pos.z = lerp(cameraTransform.pos.z, desired.z, follow.smooth);

    const camWorld = Game.utils.gameToWorld(cameraTransform.pos);
    const lookAt = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + follow.lookHeight,
      z: targetTransform.pos.z,
    };
    const lookWorld = Game.utils.gameToWorld(lookAt);

    camera(
      camWorld.x,
      camWorld.y,
      camWorld.z,
      lookWorld.x,
      lookWorld.y,
      lookWorld.z,
      0,
      1,
      0
    );

    worldRef.components.Transform.set(entity, cameraTransform);
  }
};
