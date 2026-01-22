window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.cameraControlSystem = function cameraControlSystem(worldRef, dt) {
  for (const [entity, rig] of worldRef.components.CameraRig.entries()) {
    const follow = worldRef.components.CameraFollow.get(entity);
    if (!follow) {
      continue;
    }

    const target = follow.target;
    const move = worldRef.components.MoveIntent.get(target);
    const turnSpeed = worldRef.components.TurnSpeed.get(target)?.value ?? 0;

    if (move) {
      rig.yaw += move.turn * turnSpeed * dt;
    }

    const targetTransform = worldRef.components.Transform.get(target);
    if (targetTransform) {
      targetTransform.rotY = rig.yaw;
      worldRef.components.Transform.set(target, targetTransform);
    }

    worldRef.components.CameraRig.set(entity, rig);
  }
};
