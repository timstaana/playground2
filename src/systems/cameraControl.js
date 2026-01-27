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
    if (targetTransform && !worldRef.components.Player.has(target)) {
      targetTransform.rotY = rig.yaw;
      worldRef.components.Transform.set(target, targetTransform);
    }

    worldRef.components.CameraRig.set(entity, rig);
  }
};

Game.systems.debugCameraControlSystem =
  function debugCameraControlSystem(worldRef, dt) {
    if (!worldRef || !worldRef.resources) {
      return;
    }
    const debugMode = Game.debug?.mode ?? 0;
    const debugCam = worldRef.resources.debugCamera;
    if (!debugCam) {
      return;
    }
    if (debugMode !== 2) {
      debugCam.active = false;
      return;
    }

    const cameraId = worldRef.resources.cameraId;
    const cameraTransform = cameraId
      ? worldRef.components.Transform.get(cameraId)
      : null;
    const cameraState = worldRef.resources.cameraState;

    if (!debugCam.active) {
      debugCam.active = true;
      const startPos =
        cameraState?.pos || cameraTransform?.pos || debugCam.pos;
      debugCam.pos = { x: startPos.x, y: startPos.y, z: startPos.z };
      const startLook =
        cameraState?.lookAt ||
        (cameraTransform
          ? {
              x: cameraTransform.pos.x,
              y: cameraTransform.pos.y,
              z: cameraTransform.pos.z - 1,
            }
          : {
              x: debugCam.pos.x,
              y: debugCam.pos.y,
              z: debugCam.pos.z - 1,
            });
      const dir = {
        x: startLook.x - debugCam.pos.x,
        y: startLook.y - debugCam.pos.y,
        z: startLook.z - debugCam.pos.z,
      };
      const flat = Math.hypot(dir.x, dir.z);
      if (flat > 0.0001) {
        debugCam.yaw = Math.atan2(dir.x, -dir.z);
        debugCam.pitch = Math.atan2(dir.y, flat);
      } else if (Math.abs(dir.y) > 0.0001) {
        debugCam.pitch =
          Math.sign(dir.y) * (debugCam.maxPitch ?? Math.PI * 0.45);
      }
    }

    const input = Game.systems.inputState;
    const debugInput = input?.debugCamera;
    if (debugInput) {
      const lookX = debugInput.lookDeltaX || 0;
      const lookY = debugInput.lookDeltaY || 0;
      if (lookX || lookY) {
        const sensitivity = debugCam.sensitivity ?? 0.004;
        const maxPitch = debugCam.maxPitch ?? Math.PI * 0.495;
        debugCam.yaw += lookX * sensitivity;
        debugCam.pitch = Math.max(
          -maxPitch,
          Math.min(maxPitch, debugCam.pitch - lookY * sensitivity)
        );
        debugInput.lookDeltaX = 0;
        debugInput.lookDeltaY = 0;
      }
    }

    const forwardInput =
      (keyIsDown("w") ? 1 : 0) - (keyIsDown("s") ? 1 : 0);
    const strafeInput =
      (keyIsDown("d") ? 1 : 0) - (keyIsDown("a") ? 1 : 0);
    const upInput = keyIsDown("Space") ? 1 : 0;
    const downInput = keyIsDown("Shift") ? 1 : 0;
    const verticalInput = upInput - downInput;

    const speed = debugCam.speed ?? 6;
    const step = speed * (typeof dt === "number" ? dt : 0);
    if (step > 0) {
      const sinYaw = Math.sin(debugCam.yaw);
      const cosYaw = Math.cos(debugCam.yaw);
      const forward = { x: sinYaw, z: -cosYaw };
      const right = { x: cosYaw, z: sinYaw };
      debugCam.pos.x +=
        (forward.x * forwardInput + right.x * strafeInput) * step;
      debugCam.pos.z +=
        (forward.z * forwardInput + right.z * strafeInput) * step;
      debugCam.pos.y += verticalInput * step;
    }

    if (input) {
      input.spacePressed = false;
      input.touchJumpPressed = false;
      input.touchJumpQueued = false;
      input.clickRequested = false;
      input.clickPosition = null;
    }
    const playerId = worldRef.resources.playerId;
    if (playerId) {
      const move = worldRef.components.MoveIntent.get(playerId);
      if (move) {
        move.throttle = 0;
        move.turn = 0;
        move.jumpRequested = false;
        worldRef.components.MoveIntent.set(playerId, move);
      }
    }
  };
