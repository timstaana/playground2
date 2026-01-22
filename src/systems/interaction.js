window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.interactionSystem = function interactionSystem(worldRef) {
  const inputState = Game.systems.inputState || {};
  const playerId = worldRef.resources.playerId;
  const cameraId = worldRef.resources.cameraId;
  const highlightMap = worldRef.components.Highlight;
  if (highlightMap) {
    highlightMap.clear();
  }
  if (!playerId) {
    inputState.clickRequested = false;
    return;
  }

  const lightbox = cameraId
    ? worldRef.components.Lightbox.get(cameraId)
    : null;
  const dialogueState = cameraId
    ? worldRef.components.DialogueState.get(cameraId)
    : null;
  if (!lightbox) {
    inputState.clickRequested = false;
    return;
  }
  if (!dialogueState) {
    inputState.clickRequested = false;
    return;
  }

  const playerTransform = worldRef.components.Transform.get(playerId);
  const playerCollider = worldRef.components.Collider.get(playerId);
  const move = worldRef.components.MoveIntent.get(playerId);
  if (!playerTransform || !playerCollider) {
    inputState.clickRequested = false;
    return;
  }

  const spacePressed = !!inputState.spacePressed;
  const clickRequested = !!inputState.clickRequested;
  const moveInput =
    !!move && (Math.abs(move.throttle) > 0.01 || Math.abs(move.turn) > 0.01);

  if (lightbox.mode === "lightbox") {
    if (spacePressed || clickRequested || moveInput) {
      lightbox.mode = "follow";
      lightbox.targetId = null;
      worldRef.components.Lightbox.set(cameraId, lightbox);
      if (move && spacePressed) {
        move.jumpRequested = false;
        worldRef.components.MoveIntent.set(playerId, move);
      }
    }
    inputState.clickRequested = false;
    return;
  }

  if (dialogueState.mode === "dialogue") {
    if (spacePressed || clickRequested || moveInput) {
      dialogueState.mode = "idle";
      dialogueState.targetId = null;
      worldRef.components.DialogueState.set(cameraId, dialogueState);
      if (move && spacePressed) {
        move.jumpRequested = false;
        worldRef.components.MoveIntent.set(playerId, move);
      }
    }
    inputState.clickRequested = false;
    return;
  }

  const nearest = Game.systems.scanInteractionTargets(
    worldRef,
    playerTransform,
    playerCollider,
    highlightMap
  );

  if (nearest && (spacePressed || clickRequested)) {
    const interaction = nearest.interaction || {};
    if (interaction.kind === "lightbox") {
      const targetLightbox = worldRef.components.Lightbox.get(nearest.entity);
      if (targetLightbox) {
        lightbox.distanceScale =
          targetLightbox.distanceScale ?? lightbox.distanceScale;
        lightbox.distanceOffset =
          targetLightbox.distanceOffset ?? lightbox.distanceOffset;
        lightbox.yOffset = targetLightbox.yOffset ?? lightbox.yOffset;
      }
      lightbox.mode = "lightbox";
      lightbox.targetId = nearest.entity;
      worldRef.components.Lightbox.set(cameraId, lightbox);
    } else if (interaction.kind === "dialogue") {
      dialogueState.mode = "dialogue";
      dialogueState.targetId = nearest.entity;
      worldRef.components.DialogueState.set(cameraId, dialogueState);
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
  } else if (nearest && spacePressed && move) {
    move.jumpRequested = false;
    worldRef.components.MoveIntent.set(playerId, move);
  }

  inputState.clickRequested = false;
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
          6
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
      closest = { entity, dist, interaction: { ...interaction, kind } };
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
