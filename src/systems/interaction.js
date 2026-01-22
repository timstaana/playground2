window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.applyDialogueFacing = function applyDialogueFacing(
  worldRef,
  playerId,
  targetId
) {
  if (!worldRef || !playerId || !targetId) {
    return;
  }
  if (!worldRef.components.NPC.has(targetId)) {
    return;
  }
  const playerTransform = worldRef.components.Transform.get(playerId);
  const targetTransform = worldRef.components.Transform.get(targetId);
  if (!playerTransform || !targetTransform) {
    return;
  }
  const facingMap = worldRef.components.DialogueFacing;
  if (!facingMap.has(targetId)) {
    facingMap.set(targetId, { rotY: targetTransform.rotY });
  }
  const dir = {
    x: playerTransform.pos.x - targetTransform.pos.x,
    z: playerTransform.pos.z - targetTransform.pos.z,
  };
  targetTransform.rotY = Math.atan2(dir.x, -dir.z);
  worldRef.components.Transform.set(targetId, targetTransform);
};

Game.systems.clearDialogueFacing = function clearDialogueFacing(worldRef) {
  const facingMap = worldRef?.components?.DialogueFacing;
  if (!facingMap || facingMap.size === 0) {
    return;
  }
  for (const [entity, data] of facingMap.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    if (transform && data && typeof data.rotY === "number") {
      transform.rotY = data.rotY;
      worldRef.components.Transform.set(entity, transform);
    }
  }
  facingMap.clear();
};

Game.systems.setInteractionFocus = function setInteractionFocus(
  worldRef,
  focus
) {
  if (!worldRef || !worldRef.resources) {
    return;
  }
  worldRef.resources.interactionFocus = {
    targetId: focus?.targetId ?? null,
    weight: focus?.weight ?? 0,
  };
};

Game.systems.interactionSystem = function interactionSystem(worldRef) {
  const inputState = Game.systems.inputState || {};
  const playerId = worldRef.resources.playerId;
  const cameraId = worldRef.resources.cameraId;
  const highlightMap = worldRef.components.Highlight;
  if (highlightMap) {
    highlightMap.clear();
  }
  if (!playerId) {
    Game.systems.clearDialogueFacing(worldRef);
    Game.systems.setInteractionFocus(worldRef, null);
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }

  const lightbox = cameraId
    ? worldRef.components.Lightbox.get(cameraId)
    : null;
  const dialogueState = cameraId
    ? worldRef.components.DialogueState.get(cameraId)
    : null;
  if (!lightbox) {
    Game.systems.clearDialogueFacing(worldRef);
    Game.systems.setInteractionFocus(worldRef, null);
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }
  if (!dialogueState) {
    Game.systems.clearDialogueFacing(worldRef);
    Game.systems.setInteractionFocus(worldRef, null);
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }

  const playerTransform = worldRef.components.Transform.get(playerId);
  const playerCollider = worldRef.components.Collider.get(playerId);
  const move = worldRef.components.MoveIntent.get(playerId);
  if (!playerTransform || !playerCollider) {
    Game.systems.clearDialogueFacing(worldRef);
    Game.systems.setInteractionFocus(worldRef, null);
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }

  const spacePressed = !!inputState.spacePressed;
  const clickRequested = !!inputState.clickRequested;
  const touchJumpPressed = !!inputState.touchJumpPressed;
  const interactionPressed = spacePressed && !touchJumpPressed;
  const moveInput =
    !!move && (Math.abs(move.throttle) > 0.01 || Math.abs(move.turn) > 0.01);

  if (lightbox.mode === "lightbox") {
    Game.systems.clearDialogueFacing(worldRef);
    Game.systems.setInteractionFocus(worldRef, null);
    if (interactionPressed || clickRequested || moveInput) {
      lightbox.mode = "follow";
      lightbox.targetId = null;
      worldRef.components.Lightbox.set(cameraId, lightbox);
      if (move && interactionPressed) {
        move.jumpRequested = false;
        worldRef.components.MoveIntent.set(playerId, move);
      }
    }
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }

  if (dialogueState.mode === "dialogue") {
    Game.systems.applyDialogueFacing(
      worldRef,
      playerId,
      dialogueState.targetId
    );
    Game.systems.setInteractionFocus(worldRef, null);
    if (interactionPressed || clickRequested || moveInput) {
      dialogueState.mode = "idle";
      dialogueState.targetId = null;
      worldRef.components.DialogueState.set(cameraId, dialogueState);
      Game.systems.clearDialogueFacing(worldRef);
      if (move && interactionPressed) {
        move.jumpRequested = false;
        worldRef.components.MoveIntent.set(playerId, move);
      }
    }
    inputState.clickRequested = false;
    inputState.clickPosition = null;
    return;
  }

  const nearest = Game.systems.scanInteractionTargets(
    worldRef,
    playerTransform,
    playerCollider,
    highlightMap
  );
  let clickTarget = null;
  if (clickRequested && inputState.clickPosition) {
    clickTarget = Game.systems.pickHighlightedEntity(
      worldRef,
      inputState.clickPosition.x,
      inputState.clickPosition.y
    );
  }
  if (nearest) {
    const range = nearest.range ?? 1.5;
    const weight = Math.max(0, Math.min(1, 1 - nearest.dist / range));
    Game.systems.setInteractionFocus(worldRef, {
      targetId: nearest.entity,
      weight,
    });
  } else {
    Game.systems.setInteractionFocus(worldRef, null);
  }

  const clickValid = !!clickTarget;
  const activeTarget = clickValid ? clickTarget.entity : nearest?.entity;
  const activeInteraction = clickValid
    ? worldRef.components.Interaction.get(clickTarget.entity) || {}
    : nearest?.interaction || {};
  const kind =
    activeInteraction.kind || activeInteraction.type || "lightbox";

  if (activeTarget && (interactionPressed || clickValid)) {
    const interaction = { ...activeInteraction, kind };
    if (interaction.kind === "lightbox") {
      const targetLightbox = worldRef.components.Lightbox.get(activeTarget);
      if (targetLightbox) {
        lightbox.distanceScale =
          targetLightbox.distanceScale ?? lightbox.distanceScale;
        lightbox.distanceOffset =
          targetLightbox.distanceOffset ?? lightbox.distanceOffset;
        lightbox.yOffset = targetLightbox.yOffset ?? lightbox.yOffset;
        lightbox.smooth = targetLightbox.smooth ?? lightbox.smooth;
      }
      lightbox.mode = "lightbox";
      lightbox.targetId = activeTarget;
      worldRef.components.Lightbox.set(cameraId, lightbox);
    } else if (interaction.kind === "dialogue") {
      dialogueState.mode = "dialogue";
      dialogueState.targetId = activeTarget;
      worldRef.components.DialogueState.set(cameraId, dialogueState);
      Game.systems.applyDialogueFacing(worldRef, playerId, activeTarget);
    }

    if (move) {
      move.jumpRequested = false;
      move.throttle = 0;
      move.turn = 0;
      worldRef.components.MoveIntent.set(playerId, move);
    }

    const vel = worldRef.components.Velocity.get(playerId);
    if (vel) {
      vel.x = 0;
      vel.y = 0;
      vel.z = 0;
      worldRef.components.Velocity.set(playerId, vel);
    }
  } else if (nearest && interactionPressed && move) {
    move.jumpRequested = false;
    worldRef.components.MoveIntent.set(playerId, move);
  }

  if (dialogueState.mode !== "dialogue") {
    Game.systems.clearDialogueFacing(worldRef);
  }

  inputState.clickRequested = false;
  inputState.clickPosition = null;
};

Game.systems.scanInteractionTargets = function scanInteractionTargets(
  worldRef,
  playerTransform,
  playerCollider,
  highlightMap
) {
  let closest = null;
  let closestDist = Infinity;
  const playerCenter = {
    x: playerTransform.pos.x,
    y: playerTransform.pos.y + playerCollider.h / 2,
    z: playerTransform.pos.z,
  };
  const playerForward = {
    x: Math.sin(playerTransform.rotY),
    z: -Math.cos(playerTransform.rotY),
  };

  for (const [entity, interaction] of worldRef.components.Interaction.entries()) {
    if (interaction && interaction.enabled === false) {
      continue;
    }
    const kind = interaction?.kind || interaction?.type || "lightbox";
    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }

    const min = {
      x: transform.pos.x - collider.w / 2,
      y: transform.pos.y,
      z: transform.pos.z - collider.d / 2,
    };
    const max = {
      x: transform.pos.x + collider.w / 2,
      y: transform.pos.y + collider.h,
      z: transform.pos.z + collider.d / 2,
    };

    const dist = Game.systems.distancePointToAabb(playerCenter, min, max);
    const range = interaction?.range ?? 1.5;
    if (interaction?.requireFacing) {
      const toTarget = {
        x: transform.pos.x - playerTransform.pos.x,
        z: transform.pos.z - playerTransform.pos.z,
      };
      const len = Math.hypot(toTarget.x, toTarget.z);
      if (len > 0.0001) {
        const dot =
          (toTarget.x / len) * playerForward.x +
          (toTarget.z / len) * playerForward.z;
        const facingDot = interaction?.facingDot ?? 0.2;
        if (dot < facingDot) {
          continue;
        }
      }
    }
    if (dist <= range) {
      const labelData = worldRef.components.Label.get(entity);
      let highlightColor = null;
      if (
        Array.isArray(interaction?.highlightColor) &&
        interaction.highlightColor.length >= 3
      ) {
        highlightColor = interaction.highlightColor;
      } else if (
        labelData &&
        Array.isArray(labelData.color) &&
        labelData.color.length >= 3
      ) {
        highlightColor = labelData.color;
      } else if (worldRef.components.NPC.has(entity)) {
        highlightColor = [120, 200, 255];
      } else if (worldRef.components.Painting.has(entity)) {
        highlightColor = [255, 120, 200];
      } else if (worldRef.components.Player.has(entity)) {
        highlightColor = [255, 220, 80];
      } else {
        highlightColor = [255, 200, 120];
      }
      const highlightThickness = Math.max(
        0,
        interaction?.highlightThickness ??
          interaction?.outlineThickness ??
          interaction?.highlightScale ??
          15
      );
      if (highlightMap) {
        highlightMap.set(entity, {
          color: highlightColor,
          thickness: highlightThickness,
        });
      }
    }

    if (dist <= range && dist < closestDist) {
      closestDist = dist;
      closest = { entity, dist, range, interaction: { ...interaction, kind } };
    }
  }

  return closest;
};

Game.systems.distancePointToAabb = function distancePointToAabb(
  point,
  min,
  max
) {
  const dx =
    point.x < min.x
      ? min.x - point.x
      : point.x > max.x
      ? point.x - max.x
      : 0;
  const dy =
    point.y < min.y
      ? min.y - point.y
      : point.y > max.y
      ? point.y - max.y
      : 0;
  const dz =
    point.z < min.z
      ? min.z - point.z
      : point.z > max.z
      ? point.z - max.z
      : 0;
  return Math.hypot(dx, dy, dz);
};

Game.systems.normalizeVector = function normalizeVector(vec) {
  const len = Math.hypot(vec.x, vec.y, vec.z);
  if (!len) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: vec.x / len, y: vec.y / len, z: vec.z / len };
};

Game.systems.crossVector = function crossVector(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
};

Game.systems.getCameraRayFromScreen = function getCameraRayFromScreen(
  worldRef,
  screenX,
  screenY
) {
  const cameraState = worldRef?.resources?.cameraState;
  if (!cameraState) {
    return null;
  }
  const pos = cameraState.pos;
  const lookAt = cameraState.lookAt;
  if (!pos || !lookAt) {
    return null;
  }
  const fov = cameraState.fov ?? Math.PI / 3;
  const aspect =
    cameraState.aspect ||
    (typeof width === "number" && typeof height === "number" && height > 0
      ? width / height
      : 1);
  const viewDir = Game.systems.normalizeVector({
    x: lookAt.x - pos.x,
    y: lookAt.y - pos.y,
    z: lookAt.z - pos.z,
  });
  const up = { x: 0, y: 1, z: 0 };
  const right = Game.systems.normalizeVector(Game.systems.crossVector(viewDir, up));
  const trueUp = Game.systems.normalizeVector(Game.systems.crossVector(right, viewDir));
  const ndcX =
    typeof width === "number" && width > 0 ? (screenX / width) * 2 - 1 : 0;
  const ndcY =
    typeof height === "number" && height > 0 ? 1 - (screenY / height) * 2 : 0;
  const tanFov = Math.tan(fov / 2);
  const dir = Game.systems.normalizeVector({
    x: viewDir.x + right.x * ndcX * aspect * tanFov + trueUp.x * ndcY * tanFov,
    y: viewDir.y + right.y * ndcX * aspect * tanFov + trueUp.y * ndcY * tanFov,
    z: viewDir.z + right.z * ndcX * aspect * tanFov + trueUp.z * ndcY * tanFov,
  });
  return { origin: pos, dir };
};

Game.systems.rayIntersectAabb = function rayIntersectAabb(
  origin,
  dir,
  min,
  max
) {
  let tMin = -Infinity;
  let tMax = Infinity;
  const axes = ["x", "y", "z"];
  for (const axis of axes) {
    const o = origin[axis];
    const d = dir[axis];
    const minVal = min[axis];
    const maxVal = max[axis];
    if (Math.abs(d) < 1e-6) {
      if (o < minVal || o > maxVal) {
        return null;
      }
      continue;
    }
    const t1 = (minVal - o) / d;
    const t2 = (maxVal - o) / d;
    const tNear = Math.min(t1, t2);
    const tFar = Math.max(t1, t2);
    tMin = Math.max(tMin, tNear);
    tMax = Math.min(tMax, tFar);
    if (tMin > tMax) {
      return null;
    }
  }
  if (tMax < 0) {
    return null;
  }
  return tMin >= 0 ? tMin : tMax;
};

Game.systems.pickHighlightedEntity = function pickHighlightedEntity(
  worldRef,
  screenX,
  screenY
) {
  const highlights = worldRef?.components?.Highlight;
  if (!highlights || highlights.size === 0) {
    return null;
  }
  const ray = Game.systems.getCameraRayFromScreen(worldRef, screenX, screenY);
  if (!ray) {
    return null;
  }
  let closest = null;
  let closestT = Infinity;
  for (const [entity] of highlights.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }
    const min = {
      x: transform.pos.x - collider.w / 2,
      y: transform.pos.y,
      z: transform.pos.z - collider.d / 2,
    };
    const max = {
      x: transform.pos.x + collider.w / 2,
      y: transform.pos.y + collider.h,
      z: transform.pos.z + collider.d / 2,
    };
    const t = Game.systems.rayIntersectAabb(ray.origin, ray.dir, min, max);
    if (t !== null && t < closestT) {
      closestT = t;
      closest = entity;
    }
  }
  return closest ? { entity: closest, distance: closestT } : null;
};
