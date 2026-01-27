window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.applyFocusCamera = function applyFocusCamera(
  cameraTransform,
  center,
  normal,
  distance,
  yOffset,
  sideOffset,
  right,
  smooth
) {
  const side = sideOffset ?? 0;
  const camPos = {
    x: center.x + normal.x * distance + (right ? right.x * side : 0),
    y: center.y + (yOffset ?? 0),
    z: center.z + normal.z * distance + (right ? right.z * side : 0),
  };
  const useSmooth =
    typeof smooth === "number" && smooth > 0 && smooth < 1;
  if (useSmooth) {
    cameraTransform.pos.x = lerp(cameraTransform.pos.x, camPos.x, smooth);
    cameraTransform.pos.y = lerp(cameraTransform.pos.y, camPos.y, smooth);
    cameraTransform.pos.z = lerp(cameraTransform.pos.z, camPos.z, smooth);
  } else {
    cameraTransform.pos.x = camPos.x;
    cameraTransform.pos.y = camPos.y;
    cameraTransform.pos.z = camPos.z;
  }

  const camWorld = Game.utils.gameToWorld(cameraTransform.pos);
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

Game.systems.setCameraState = function setCameraState(
  worldRef,
  pos,
  lookAt
) {
  if (!worldRef || !worldRef.resources) {
    return;
  }
  const aspect =
    typeof width === "number" && typeof height === "number" && height > 0
      ? width / height
      : 1;
  worldRef.resources.cameraState = {
    pos: { x: pos.x, y: pos.y, z: pos.z },
    lookAt: { x: lookAt.x, y: lookAt.y, z: lookAt.z },
    fov: worldRef.resources.cameraState?.fov ?? Math.PI / 3,
    aspect,
  };
};

Game.systems.getFitDistanceForBounds =
  function getFitDistanceForBounds(width, height, fov, aspect, padding) {
    if (!width || !height || width <= 0 || height <= 0) {
      return null;
    }
    const vFov = fov ?? Math.PI / 3;
    const safeAspect = aspect && aspect > 0 ? aspect : 1;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
    const distV = (height * 0.5) / Math.tan(vFov / 2);
    const distH = (width * 0.5) / Math.tan(hFov / 2);
    const base = Math.max(distV, distH);
    const pad = padding ?? 1.06;
    return base * pad;
  };

Game.systems.applyCameraPerspective =
  function applyCameraPerspective(worldRef) {
    if (!worldRef || !worldRef.resources) {
      return;
    }
    const aspect =
      typeof width === "number" && typeof height === "number" && height > 0
        ? width / height
        : 1;
    const cameraState = worldRef.resources.cameraState;
    const fov = cameraState?.fov ?? Math.PI / 3;
    const near = cameraState?.near ?? 0.1;
    const far = cameraState?.far ?? 10000;
    if (typeof perspective === "function") {
      perspective(fov, aspect, near, far);
    }
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

  Game.systems.applyCameraPerspective(worldRef);

  const debugMode = Game.debug?.mode ?? 0;
  if (debugMode === 2) {
    const debugCam = worldRef.resources?.debugCamera;
    if (debugCam && debugCam.pos) {
      const yaw = debugCam.yaw ?? 0;
      const pitch = debugCam.pitch ?? 0;
      const cosPitch = Math.cos(pitch);
      const lookDir = {
        x: Math.sin(yaw) * cosPitch,
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * cosPitch,
      };
      const pos = debugCam.pos;
      const lookAt = {
        x: pos.x + lookDir.x,
        y: pos.y + lookDir.y,
        z: pos.z + lookDir.z,
      };

      cameraTransform.pos.x = pos.x;
      cameraTransform.pos.y = pos.y;
      cameraTransform.pos.z = pos.z;
      const camWorld = Game.utils.gameToWorld(pos);
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
      Game.systems.setCameraState(worldRef, pos, lookAt);
      worldRef.components.Transform.set(cameraId, cameraTransform);
      return;
    }
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
    const targetSprite = worldRef.components.BillboardSprite.get(targetId);
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
    const rig = worldRef.components.CameraRig.get(cameraId);
    let smoothedCenter = center;
    if (rig) {
      const lookSmooth = Math.min(0.3, Math.max(0.05, lightbox.smooth ?? 0.2));
      if (!rig.lookAt) {
        rig.lookAt = { ...center };
      }
      rig.lookAt = {
        x: lerp(rig.lookAt.x, center.x, lookSmooth),
        y: lerp(rig.lookAt.y, center.y, lookSmooth),
        z: lerp(rig.lookAt.z, center.z, lookSmooth),
      };
      rig.focusBlend = 0;
      rig.dialogueBlend = 0;
      smoothedCenter = rig.lookAt;
      worldRef.components.CameraRig.set(cameraId, rig);
    }
    const normal = {
      x: Math.sin(targetTransform.rotY),
      z: Math.cos(targetTransform.rotY),
    };
    const isPainting = worldRef.components.Painting.has(targetId);
    const aspect =
      typeof width === "number" && typeof height === "number" && height > 0
        ? width / height
        : 1;
    let distance = null;
    if (isPainting) {
      const fitWidth = targetSprite?.width ?? targetCollider.w;
      const fitHeight = targetSprite?.height ?? targetCollider.h;
      const padding =
        lightbox.fitPadding ??
        worldRef.components.Lightbox.get(targetId)?.fitPadding ??
        1.06;
      distance = Game.systems.getFitDistanceForBounds(
        fitWidth,
        fitHeight,
        worldRef.resources.cameraState?.fov ?? Math.PI / 3,
        aspect,
        padding
      );
    }
    if (distance === null) {
      const maxDim = Math.max(targetCollider.w, targetCollider.h);
      distance =
        maxDim * (lightbox.distanceScale ?? 1.4) +
        (lightbox.distanceOffset ?? 0.6);
    }
    const smooth = lightbox.smooth ?? 0.2;
    Game.systems.applyFocusCamera(
      cameraTransform,
      smoothedCenter,
      normal,
      distance,
      lightbox.yOffset,
      null,
      null,
      smooth
    );
    Game.systems.setCameraState(worldRef, cameraTransform.pos, smoothedCenter);
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

    const blendSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    let dialogueBlend = 1;
    if (rig) {
      rig.dialogueTargetId = dialogueState.targetId ?? rig.dialogueTargetId;
      rig.dialogueBlend = lerp(rig.dialogueBlend ?? 0, 1, blendSmooth);
      rig.focusBlend = 0;
      dialogueBlend = rig.dialogueBlend;
    }

    const zoomDistance = lerp(
      follow.distance,
      follow.distance * 0.85,
      dialogueBlend
    );
    const zoomHeight = lerp(
      follow.height,
      follow.height * 0.95,
      dialogueBlend
    );
    const zoomSide = lerp(
      follow.side,
      follow.side * 0.9,
      dialogueBlend
    );

    const desired = {
      x: targetTransform.pos.x - forward.x * zoomDistance + right.x * zoomSide,
      y: targetTransform.pos.y + zoomHeight,
      z: targetTransform.pos.z - forward.z * zoomDistance + right.z * zoomSide,
    };
    const baseLookHeight = follow.lookHeight ?? 0;
    const targetOffset = -Math.min(1, baseLookHeight);
    const offsetSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    let lookOffset = targetOffset;
    if (rig) {
      rig.lookOffsetY = lerp(rig.lookOffsetY ?? 0, targetOffset, offsetSmooth);
      lookOffset = rig.lookOffsetY;
    }

    const baseLookAt = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + baseLookHeight + lookOffset,
      z: targetTransform.pos.z,
    };
    let lookAt = baseLookAt;
    let speakerLookAt = null;
    const speakerId = dialogueState.targetId ?? rig?.dialogueTargetId;
    if (speakerId) {
      const speakerTransform = worldRef.components.Transform.get(speakerId);
      const speakerCollider = worldRef.components.Collider.get(speakerId);
      if (speakerTransform && speakerCollider) {
        const speakerHeight = Math.min(baseLookHeight, speakerCollider.h * 0.7);
        speakerLookAt = {
          x: speakerTransform.pos.x,
          y: speakerTransform.pos.y + speakerHeight + lookOffset,
          z: speakerTransform.pos.z,
        };
      }
    }
    if (speakerLookAt) {
      const focusT = Math.min(1, 0.7 * dialogueBlend);
      lookAt = {
        x: lerp(baseLookAt.x, speakerLookAt.x, focusT),
        y: lerp(baseLookAt.y, speakerLookAt.y, focusT),
        z: lerp(baseLookAt.z, speakerLookAt.z, focusT),
      };
    }
    const lookSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    if (rig) {
      if (!rig.lookAt) {
        rig.lookAt = { ...lookAt };
      }
      rig.lookAt = {
        x: lerp(rig.lookAt.x, lookAt.x, lookSmooth),
        y: lerp(rig.lookAt.y, lookAt.y, lookSmooth),
        z: lerp(rig.lookAt.z, lookAt.z, lookSmooth),
      };
      lookAt = rig.lookAt;
      worldRef.components.CameraRig.set(cameraId, rig);
    }

    const clamped = Game.systems.clampCameraToBlocks(
      worldRef,
      lookAt,
      desired
    );
    const adjusted = {
      x: lerp(desired.x, clamped.x, dialogueBlend),
      y: lerp(desired.y, clamped.y, dialogueBlend),
      z: lerp(desired.z, clamped.z, dialogueBlend),
    };

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
    Game.systems.setCameraState(worldRef, cameraTransform.pos, lookAt);
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

    const blendSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    let dialogueBlend = 0;
    if (rig && entity === cameraId) {
      rig.dialogueBlend = lerp(rig.dialogueBlend ?? 0, 0, blendSmooth);
      dialogueBlend = rig.dialogueBlend;
      if (dialogueBlend < 0.01) {
        rig.dialogueTargetId = null;
      }
    }
    const blendDistance = lerp(
      follow.distance,
      follow.distance * 0.85,
      dialogueBlend
    );
    const blendHeight = lerp(
      follow.height,
      follow.height * 0.95,
      dialogueBlend
    );
    const blendSide = lerp(follow.side, follow.side * 0.9, dialogueBlend);

    const desired = {
      x: targetTransform.pos.x - forward.x * blendDistance + right.x * blendSide,
      y: targetTransform.pos.y + blendHeight,
      z: targetTransform.pos.z - forward.z * blendDistance + right.z * blendSide,
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
    const baseLookHeight = follow.lookHeight ?? 0;
    const offsetSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    let lookOffset = 0;
    if (rig) {
      rig.lookOffsetY = lerp(rig.lookOffsetY ?? 0, 0, offsetSmooth);
      lookOffset = rig.lookOffsetY;
    }
    const baseLookAt = {
      x: targetTransform.pos.x,
      y: targetTransform.pos.y + baseLookHeight + lookOffset,
      z: targetTransform.pos.z,
    };
    let lookAt = baseLookAt;
    let speakerLookAt = null;
    const speakerId = rig?.dialogueTargetId;
    if (speakerId && dialogueBlend > 0.001) {
      const speakerTransform = worldRef.components.Transform.get(speakerId);
      const speakerCollider = worldRef.components.Collider.get(speakerId);
      if (speakerTransform && speakerCollider) {
        const speakerHeight = Math.min(baseLookHeight, speakerCollider.h * 0.7);
        speakerLookAt = {
          x: speakerTransform.pos.x,
          y: speakerTransform.pos.y + speakerHeight + lookOffset,
          z: speakerTransform.pos.z,
        };
      }
    }
    if (speakerLookAt) {
      const focusT = Math.min(1, 0.7 * dialogueBlend);
      lookAt = {
        x: lerp(baseLookAt.x, speakerLookAt.x, focusT),
        y: lerp(baseLookAt.y, speakerLookAt.y, focusT),
        z: lerp(baseLookAt.z, speakerLookAt.z, focusT),
      };
    }
    const focus = worldRef.resources.interactionFocus;
    if (focus?.targetId && focus.weight > 0) {
      const focusTransform = worldRef.components.Transform.get(focus.targetId);
      const focusCollider = worldRef.components.Collider.get(focus.targetId);
      if (focusTransform && focusCollider) {
        const focusPos = {
          x: focusTransform.pos.x,
          y: focusTransform.pos.y + focusCollider.h / 2,
          z: focusTransform.pos.z,
        };
        let t = Math.min(0.35, 0.35 * focus.weight);
        t *= 1 - dialogueBlend;
        if (rig) {
          rig.focusBlend = lerp(rig.focusBlend ?? 0, t, blendSmooth);
          t = rig.focusBlend;
        }
        const startLookAt = lookAt;
        lookAt = {
          x: lerp(startLookAt.x, focusPos.x, t),
          y: lerp(startLookAt.y, focusPos.y, t),
          z: lerp(startLookAt.z, focusPos.z, t),
        };
      }
    } else if (rig) {
      rig.focusBlend = lerp(rig.focusBlend ?? 0, 0, blendSmooth);
    }
    const lookSmooth = Math.min(0.25, Math.max(0.05, follow.smooth ?? 0.15));
    if (rig) {
      if (!rig.lookAt) {
        rig.lookAt = { ...lookAt };
      }
      rig.lookAt = {
        x: lerp(rig.lookAt.x, lookAt.x, lookSmooth),
        y: lerp(rig.lookAt.y, lookAt.y, lookSmooth),
        z: lerp(rig.lookAt.z, lookAt.z, lookSmooth),
      };
      lookAt = rig.lookAt;
      worldRef.components.CameraRig.set(entity, rig);
    }
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
    if (entity === cameraId) {
      Game.systems.setCameraState(worldRef, activeCameraTransform.pos, lookAt);
    }
    worldRef.components.Transform.set(entity, activeCameraTransform);
  }
};
