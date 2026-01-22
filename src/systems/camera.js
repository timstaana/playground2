window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.applyFocusCamera = function applyFocusCamera(
  cameraTransform,
  center,
  normal,
  distance,
  yOffset,
  sideOffset,
  right
) {
  const side = sideOffset ?? 0;
  const camPos = {
    x: center.x + normal.x * distance + (right ? right.x * side : 0),
    y: center.y + (yOffset ?? 0),
    z: center.z + normal.z * distance + (right ? right.z * side : 0),
  };
  cameraTransform.pos.x = camPos.x;
  cameraTransform.pos.y = camPos.y;
  cameraTransform.pos.z = camPos.z;

  const camWorld = Game.utils.gameToWorld(camPos);
  const lookWorld = Game.utils.gameToWorld(center);
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
};

Game.systems.clampCameraToBlocks = function clampCameraToBlocks(
  worldRef,
  from,
  to
) {
  if (!worldRef || !worldRef.resources?.blockSet) {
    return { x: to.x, y: to.y, z: to.z };
  }
  const dir = {
    x: to.x - from.x,
    y: to.y - from.y,
    z: to.z - from.z,
  };
  const dist = Math.hypot(dir.x, dir.y, dir.z);
  if (dist <= 0.0001) {
    return { x: to.x, y: to.y, z: to.z };
  }
  const steps = Math.max(1, Math.ceil(dist / 0.15));
  let lastSafe = { x: from.x, y: from.y, z: from.z };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const pos = {
      x: from.x + dir.x * t,
      y: from.y + dir.y * t,
      z: from.z + dir.z * t,
    };
    if (
      Game.utils.isBlockAt(
        worldRef,
        Math.floor(pos.x),
        Math.floor(pos.y),
        Math.floor(pos.z)
      )
    ) {
      return lastSafe;
    }
    lastSafe = pos;
  }
  return { x: to.x, y: to.y, z: to.z };
};

Game.systems.cameraSystem = function cameraSystem(worldRef) {
  const cameraId = worldRef.resources.cameraId;
  if (!cameraId) {
    return;
  }
  const cameraTransform = worldRef.components.Transform.get(cameraId);
  if (!cameraTransform) {
    return;
  }

  const lightbox = worldRef.components.Lightbox.get(cameraId);
  if (lightbox?.mode === "lightbox") {
    const targetId = lightbox.targetId;
    if (!targetId) {
      lightbox.mode = "follow";
      lightbox.targetId = null;
      worldRef.components.Lightbox.set(cameraId, lightbox);
      return;
    }

    const targetTransform = worldRef.components.Transform.get(targetId);
    const targetCollider = worldRef.components.Collider.get(targetId);
    if (!targetTransform || !targetCollider || !cameraTransform) {
      lightbox.mode = "follow";
      lightbox.targetId = null;
      worldRef.components.Lightbox.set(cameraId, lightbox);
      return;
    }

    const center = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + targetCollider.h / 2,
      z: targetTransform.pos.z,
    };
    const normal = {
      x: Math.sin(targetTransform.rotY),
      z: Math.cos(targetTransform.rotY),
    };
    const maxDim = Math.max(targetCollider.w, targetCollider.h);
    const distance =
      maxDim * (lightbox.distanceScale ?? 1.4) +
      (lightbox.distanceOffset ?? 0.6);
    Game.systems.applyFocusCamera(
      cameraTransform,
      center,
      normal,
      distance,
      lightbox.yOffset
    );
    worldRef.components.Transform.set(cameraId, cameraTransform);
    return;
  }

  const dialogueState = worldRef.components.DialogueState.get(cameraId);
  if (dialogueState?.mode === "dialogue") {
    const follow = worldRef.components.CameraFollow.get(cameraId);
    const rig = worldRef.components.CameraRig.get(cameraId);
    if (!follow) {
      return;
    }
    const targetTransform = worldRef.components.Transform.get(follow.target);
    if (!targetTransform) {
      return;
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

    const zoomDistance = follow.distance * 0.85;
    const zoomHeight = follow.height * 0.95;
    const zoomSide = follow.side * 0.9;

    const desired = {
      x: targetTransform.pos.x - forward.x * zoomDistance + right.x * zoomSide,
      y: targetTransform.pos.y + zoomHeight,
      z: targetTransform.pos.z - forward.z * zoomDistance + right.z * zoomSide,
    };
    const lookAt = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + follow.lookHeight,
      z: targetTransform.pos.z,
    };
    const adjusted = Game.systems.clampCameraToBlocks(
      worldRef,
      lookAt,
      desired
    );

    cameraTransform.pos.x = lerp(
      cameraTransform.pos.x,
      adjusted.x,
      follow.smooth
    );
    cameraTransform.pos.y = lerp(
      cameraTransform.pos.y,
      adjusted.y,
      follow.smooth
    );
    cameraTransform.pos.z = lerp(
      cameraTransform.pos.z,
      adjusted.z,
      follow.smooth
    );

    const camWorld = Game.utils.gameToWorld(cameraTransform.pos);
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
    worldRef.components.Transform.set(cameraId, cameraTransform);
    return;
  }

  for (const [entity, follow] of worldRef.components.CameraFollow.entries()) {
    const targetTransform = worldRef.components.Transform.get(follow.target);
    const activeCameraTransform = worldRef.components.Transform.get(entity);
    const rig = worldRef.components.CameraRig.get(entity);
    if (!targetTransform || !activeCameraTransform) {
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

    activeCameraTransform.pos.x = lerp(
      activeCameraTransform.pos.x,
      desired.x,
      follow.smooth
    );
    activeCameraTransform.pos.y = lerp(
      activeCameraTransform.pos.y,
      desired.y,
      follow.smooth
    );
    activeCameraTransform.pos.z = lerp(
      activeCameraTransform.pos.z,
      desired.z,
      follow.smooth
    );

    const camWorld = Game.utils.gameToWorld(activeCameraTransform.pos);
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

    worldRef.components.Transform.set(entity, activeCameraTransform);
  }
};
