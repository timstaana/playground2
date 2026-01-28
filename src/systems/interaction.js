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

  const cameraTransform = cameraId
    ? worldRef.components.Transform.get(cameraId)
    : null;
  const cameraPos =
    worldRef.resources?.cameraState?.pos || cameraTransform?.pos || null;
  if (cameraPos) {
    const toCam = {
      x: cameraPos.x - playerTransform.pos.x,
      z: cameraPos.z - playerTransform.pos.z,
    };
    const toCamLen = Math.hypot(toCam.x, toCam.z);
    if (toCamLen > 1e-4) {
      const playerForward = {
        x: Math.sin(playerTransform.rotY),
        z: -Math.cos(playerTransform.rotY),
      };
      const dot =
        (toCam.x / toCamLen) * playerForward.x +
        (toCam.z / toCamLen) * playerForward.z;
      if (dot > 0) {
        Game.systems.setInteractionFocus(worldRef, null);
        inputState.clickRequested = false;
        inputState.clickPosition = null;
        return;
      }
    }
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

Game.systems.readMat4 = function readMat4(matrix) {
  if (!matrix) {
    return null;
  }
  if (Array.isArray(matrix) || matrix.length === 16) {
    return matrix;
  }
  if (matrix.mat4 && matrix.mat4.length === 16) {
    return matrix.mat4;
  }
  if (matrix.elements && matrix.elements.length === 16) {
    return matrix.elements;
  }
  if (matrix.m && matrix.m.length === 16) {
    return matrix.m;
  }
  return null;
};

Game.systems.mulMat4 = function mulMat4(a, b) {
  const out = new Float32Array(16);
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3];
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7];
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11];
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15];

  let b0 = b[0],
    b1 = b[1],
    b2 = b[2],
    b3 = b[3];
  out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[4];
  b1 = b[5];
  b2 = b[6];
  b3 = b[7];
  out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[8];
  b1 = b[9];
  b2 = b[10];
  b3 = b[11];
  out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  b0 = b[12];
  b1 = b[13];
  b2 = b[14];
  b3 = b[15];
  out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
  out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
  out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
  out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

  return out;
};

Game.systems.invertMat4 = function invertMat4(a) {
  const out = new Float32Array(16);
  const a00 = a[0],
    a01 = a[1],
    a02 = a[2],
    a03 = a[3];
  const a10 = a[4],
    a11 = a[5],
    a12 = a[6],
    a13 = a[7];
  const a20 = a[8],
    a21 = a[9],
    a22 = a[10],
    a23 = a[11];
  const a30 = a[12],
    a31 = a[13],
    a32 = a[14],
    a33 = a[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det =
    b00 * b11 -
    b01 * b10 +
    b02 * b09 +
    b03 * b08 -
    b04 * b07 +
    b05 * b06;
  if (!det) {
    return null;
  }
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
};

Game.systems.transformMat4 = function transformMat4(mat, v) {
  const x = v[0];
  const y = v[1];
  const z = v[2];
  const w = v[3];
  return {
    x: mat[0] * x + mat[4] * y + mat[8] * z + mat[12] * w,
    y: mat[1] * x + mat[5] * y + mat[9] * z + mat[13] * w,
    z: mat[2] * x + mat[6] * y + mat[10] * z + mat[14] * w,
    w: mat[3] * x + mat[7] * y + mat[11] * z + mat[15] * w,
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
  const renderer =
    typeof _renderer !== "undefined" && _renderer ? _renderer : null;
  const camera = renderer?._curCamera || null;
  let viewMat = Game.systems.readMat4(
    camera?.viewMatrix || camera?._viewMatrix
  );
  if (!viewMat) {
    const cameraMat = Game.systems.readMat4(
      camera?.cameraMatrix || camera?._cameraMatrix
    );
    if (cameraMat) {
      viewMat = Game.systems.invertMat4(cameraMat) || cameraMat;
    }
  }
  const projMat = Game.systems.readMat4(
    camera?.projMatrix || camera?.projectionMatrix || camera?._projMatrix
  );

  const useMatrixRay = !!worldRef?.resources?.editor?.useMatrixRay;
  if (useMatrixRay && viewMat && projMat) {
    const viewProj = Game.systems.mulMat4(projMat, viewMat);
    const invViewProj = Game.systems.invertMat4(viewProj);
    if (invViewProj) {
      const dpr = typeof pixelDensity === "function" ? pixelDensity() : 1;
      const renderW =
        (renderer && typeof renderer.width === "number" && renderer.width) ||
        (typeof width === "number" ? width : 1);
      const renderH =
        (renderer && typeof renderer.height === "number" && renderer.height) ||
        (typeof height === "number" ? height : 1);
      const viewport =
        (renderer && renderer._viewport && renderer._viewport.length >= 4
          ? renderer._viewport
          : null) || [0, 0, renderW, renderH];
      const vx = viewport[0] || 0;
      const vy = viewport[1] || 0;
      const vw = viewport[2] || renderW;
      const vh = viewport[3] || renderH;
      const cssW = typeof width === "number" && width > 0 ? width : vw;
      const cssH = typeof height === "number" && height > 0 ? height : vh;
      const scaleX = cssW > 0 ? vw / cssW : 1;
      const scaleY = cssH > 0 ? vh / cssH : 1;
      const sx = screenX * scaleX + vx;
      const sy = screenY * scaleY + vy;
      const ndcX = vw > 0 ? ((sx - vx) / vw) * 2 - 1 : 0;
      const ndcY = vh > 0 ? 1 - ((sy - vy) / vh) * 2 : 0;
      const nearClip = [ndcX, ndcY, -1, 1];
      const farClip = [ndcX, ndcY, 1, 1];
      const nearWorld = Game.systems.transformMat4(invViewProj, nearClip);
      const farWorld = Game.systems.transformMat4(invViewProj, farClip);
      const nearInv = nearWorld.w ? 1 / nearWorld.w : 1;
      const farInv = farWorld.w ? 1 / farWorld.w : 1;
      const size = Game.config.gridSize || 1;
      const origin = {
        x: (nearWorld.x * nearInv) / size,
        y: (-nearWorld.y * nearInv) / size,
        z: (nearWorld.z * nearInv) / size,
      };
      const farGame = {
        x: (farWorld.x * farInv) / size,
        y: (-farWorld.y * farInv) / size,
        z: (farWorld.z * farInv) / size,
      };
      const dir = Game.systems.normalizeVector({
        x: farGame.x - origin.x,
        y: farGame.y - origin.y,
        z: farGame.z - origin.z,
      });
      return { origin, dir };
    }
  }

  let fov = cameraState.fov ?? Math.PI / 3;
  let aspect =
    cameraState.aspect ||
    (typeof width === "number" && typeof height === "number" && height > 0
      ? width / height
      : 1);
  if (projMat && projMat.length >= 16) {
    const m0 = projMat[0];
    const m5 = projMat[5];
    if (m0 && m5) {
      fov = 2 * Math.atan(1 / m5);
      aspect = m5 / m0;
    }
  }
  const worldPos = Game.utils.gameToWorld(pos);
  const worldLook = Game.utils.gameToWorld(lookAt);
  const viewDirWorld = Game.systems.normalizeVector({
    x: worldLook.x - worldPos.x,
    y: worldLook.y - worldPos.y,
    z: worldLook.z - worldPos.z,
  });
  const upWorld = { x: 0, y: 1, z: 0 };
  const rightWorld = Game.systems.normalizeVector(
    Game.systems.crossVector(viewDirWorld, upWorld)
  );
  const trueUpWorld = Game.systems.normalizeVector(
    Game.systems.crossVector(viewDirWorld, rightWorld)
  );
  const ndcX =
    typeof width === "number" && width > 0 ? (screenX / width) * 2 - 1 : 0;
  const ndcY =
    typeof height === "number" && height > 0
      ? 1 - (screenY / height) * 2
      : 0;
  const tanFov = Math.tan(fov / 2);
  const dirWorld = Game.systems.normalizeVector({
    x:
      viewDirWorld.x +
      rightWorld.x * ndcX * aspect * tanFov +
      trueUpWorld.x * ndcY * tanFov,
    y:
      viewDirWorld.y +
      rightWorld.y * ndcX * aspect * tanFov +
      trueUpWorld.y * ndcY * tanFov,
    z:
      viewDirWorld.z +
      rightWorld.z * ndcX * aspect * tanFov +
      trueUpWorld.z * ndcY * tanFov,
  });
  const dir = { x: dirWorld.x, y: -dirWorld.y, z: dirWorld.z };
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
