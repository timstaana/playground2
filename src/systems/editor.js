window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.ensureEditorState = function ensureEditorState(worldRef) {
  if (!worldRef || !worldRef.resources) {
    return null;
  }
  if (!worldRef.resources.editor) {
    worldRef.resources.editor = {
      enabled: true,
      hoveredBlock: null,
      hoveredEntity: null,
      hoverMaxDistance: 20,
      hoverColor: [255, 200, 120],
      hoverThickness: 2,
      hoverScale: 1.02,
      blockColor: [110, 145, 110],
      consumeClicks: true,
      holdDelay: 200,
      dragThreshold: 6,
      dragActive: false,
      dragEntity: null,
      dragCell: null,
      dragPlaneY: 0,
      pointerDown: false,
      pointerDownAt: 0,
      pointerStart: null,
      pointerHit: null,
      pointerEntityHit: null,
      pointerTargetType: null,
      pointerHeld: false,
      selectedCell: null,
      selectedEntity: null,
      selectedEntityId: null,
      selectedColor: [120, 220, 255],
      selectedThickness: 3,
      selectedScale: 1.08,
      blockIndex: new Map(),
      dragEntityCell: null,
      lastMode: -1,
      handleLength: 0,
      handleRadius: 0.12,
      rotateHandleRadius: 0,
      rotateHandleThickness: 0.12,
      activeHandle: null,
      handleRotateOffset: 0,
    };
  }
  return worldRef.resources.editor;
};

Game.systems.raycastBlocks = function raycastBlocks(
  worldRef,
  ray,
  maxDistance
) {
  if (!worldRef || !worldRef.resources?.blockSet || !ray) {
    return null;
  }
  const origin = ray.origin;
  const dir = Game.systems.normalizeVector(ray.dir);
  const distanceLimit =
    typeof maxDistance === "number" && maxDistance > 0 ? maxDistance : 20;
  if (!origin || !dir) {
    return null;
  }

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  if (Game.utils.isBlockAt(worldRef, x, y, z)) {
    return {
      x,
      y,
      z,
      distance: 0,
      normal: null,
      hitPos: { x: origin.x, y: origin.y, z: origin.z },
    };
  }

  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  const invX = Math.abs(dir.x) > 1e-6 ? 1 / dir.x : 0;
  const invY = Math.abs(dir.y) > 1e-6 ? 1 / dir.y : 0;
  const invZ = Math.abs(dir.z) > 1e-6 ? 1 / dir.z : 0;

  const nextX = stepX > 0 ? x + 1 : x;
  const nextY = stepY > 0 ? y + 1 : y;
  const nextZ = stepZ > 0 ? z + 1 : z;

  let tMaxX =
    Math.abs(dir.x) > 1e-6 ? (nextX - origin.x) * invX : Infinity;
  let tMaxY =
    Math.abs(dir.y) > 1e-6 ? (nextY - origin.y) * invY : Infinity;
  let tMaxZ =
    Math.abs(dir.z) > 1e-6 ? (nextZ - origin.z) * invZ : Infinity;

  const tDeltaX = Math.abs(dir.x) > 1e-6 ? Math.abs(invX) : Infinity;
  const tDeltaY = Math.abs(dir.y) > 1e-6 ? Math.abs(invY) : Infinity;
  const tDeltaZ = Math.abs(dir.z) > 1e-6 ? Math.abs(invZ) : Infinity;

  let traveled = 0;
  let lastStep = null;
  while (traveled <= distanceLimit) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        traveled = tMaxX;
        tMaxX += tDeltaX;
        lastStep = { axis: "x", step: stepX };
      } else {
        z += stepZ;
        traveled = tMaxZ;
        tMaxZ += tDeltaZ;
        lastStep = { axis: "z", step: stepZ };
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      traveled = tMaxY;
      tMaxY += tDeltaY;
      lastStep = { axis: "y", step: stepY };
    } else {
      z += stepZ;
      traveled = tMaxZ;
      tMaxZ += tDeltaZ;
      lastStep = { axis: "z", step: stepZ };
    }

    if (traveled > distanceLimit) {
      break;
    }
    if (Game.utils.isBlockAt(worldRef, x, y, z)) {
      const normal = { x: 0, y: 0, z: 0 };
      if (lastStep) {
        if (lastStep.axis === "x") {
          normal.x = -lastStep.step;
        } else if (lastStep.axis === "y") {
          normal.y = -lastStep.step;
        } else if (lastStep.axis === "z") {
          normal.z = -lastStep.step;
        }
      }
      const hitPos = {
        x: origin.x + dir.x * traveled,
        y: origin.y + dir.y * traveled,
        z: origin.z + dir.z * traveled,
      };
      return { x, y, z, distance: traveled, normal, hitPos };
    }
  }

  return null;
};

Game.systems.ensureEditorBlockIndex =
  function ensureEditorBlockIndex(worldRef, editor) {
  if (!editor.blockIndex) {
    editor.blockIndex = new Map();
  }
  const blockSetSize = worldRef?.resources?.blockSet?.size ?? 0;
  const globalIndex = worldRef?.resources?.blockIndex;
  if (globalIndex) {
    editor.blockIndex = globalIndex;
    if (globalIndex.size === blockSetSize) {
      return;
    }
    globalIndex.clear();
  } else if (editor.blockIndex.size === blockSetSize) {
    return;
  } else {
    editor.blockIndex.clear();
  }
  if (!worldRef || !worldRef.components?.StaticBlock) {
    return;
  }
  for (const [entity] of worldRef.components.StaticBlock.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    if (!transform || !transform.pos) {
      continue;
    }
    const cell = {
      x: Math.floor(transform.pos.x),
      y: Math.floor(transform.pos.y),
      z: Math.floor(transform.pos.z),
    };
    const key = Game.utils.blockKey(cell.x, cell.y, cell.z);
    const targetIndex = globalIndex || editor.blockIndex;
    targetIndex.set(key, entity);
  }
};

Game.systems.getEditorBlockEntityAt =
  function getEditorBlockEntityAt(editor, x, y, z) {
    if (!editor?.blockIndex) {
      return null;
    }
    return editor.blockIndex.get(Game.utils.blockKey(x, y, z)) ?? null;
  };

Game.systems.isEditorMovableEntity = function isEditorMovableEntity(
  worldRef,
  entity
) {
  if (!worldRef || !entity) {
    return false;
  }
  if (worldRef.components.Player?.has(entity)) {
    return false;
  }
  if (worldRef.components.RemotePlayer?.has(entity)) {
    return false;
  }
  return (
    worldRef.components.Painting?.has(entity) ||
    worldRef.components.NPC?.has(entity)
  );
};

Game.systems.pickEditorEntity = function pickEditorEntity(
  worldRef,
  ray,
  maxDistance
) {
  if (!worldRef || !ray) {
    return null;
  }
  const distanceLimit =
    typeof maxDistance === "number" && maxDistance > 0 ? maxDistance : 20;
  let closest = null;
  let closestT = Infinity;
  for (const [entity, transform] of worldRef.components.Transform.entries()) {
    if (!Game.systems.isEditorMovableEntity(worldRef, entity)) {
      continue;
    }
    const collider = worldRef.components.Collider.get(entity);
    if (!transform?.pos || !collider) {
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
    if (t !== null && t <= distanceLimit && t < closestT) {
      closestT = t;
      closest = entity;
    }
  }
  if (!closest) {
    return null;
  }
  return {
    entity: closest,
    distance: closestT,
    hitPos: {
      x: ray.origin.x + ray.dir.x * closestT,
      y: ray.origin.y + ray.dir.y * closestT,
      z: ray.origin.z + ray.dir.z * closestT,
    },
  };
};

Game.systems.getEditorSelection = function getEditorSelection(worldRef, editor) {
  if (!worldRef || !editor) {
    return null;
  }
  if (editor.selectedEntityId) {
    return { type: "entity", entity: editor.selectedEntityId };
  }
  if (editor.selectedEntity) {
    return { type: "block", entity: editor.selectedEntity };
  }
  return null;
};

Game.systems.buildEditorEntityJson = function buildEditorEntityJson(
  worldRef,
  selection
) {
  if (!worldRef || !selection) {
    return null;
  }
  const entity = selection.entity;
  const components = {};
  for (const [name, map] of Object.entries(worldRef.components || {})) {
    if (name === "Highlight") {
      continue;
    }
    if (!map || typeof map.get !== "function") {
      continue;
    }
    if (!map.has(entity)) {
      continue;
    }
    const data = map.get(entity);
    try {
      components[name] = JSON.parse(JSON.stringify(data));
    } catch (err) {
      // skip non-serializable component data
    }
  }
  return {
    entity,
    type: selection.type,
    components,
  };
};

Game.systems.applyEditorEntityJson = function applyEditorEntityJson(
  worldRef,
  selection,
  payload
) {
  if (!worldRef || !selection || !payload || typeof payload !== "object") {
    return { ok: false, message: "Invalid payload." };
  }
  const entity = selection.entity;
  const components = payload.components;
  if (!components || typeof components !== "object") {
    return { ok: false, message: "Missing components." };
  }
  const editor = worldRef.resources?.editor;
  let pendingTransform = null;
  const currentTransform = worldRef.components.Transform.get(entity);
  const hadStaticBlock = worldRef.components.StaticBlock?.has(entity);

  for (const [name, data] of Object.entries(components)) {
    const map = worldRef.components?.[name];
    if (!map || typeof map.set !== "function") {
      continue;
    }
    if (data === null) {
      map.delete(entity);
      continue;
    }
    if (name === "Transform") {
      pendingTransform = data;
      continue;
    }
    map.set(entity, data);
  }

  if (pendingTransform) {
    if (
      selection.type === "block" ||
      (hadStaticBlock && editor && typeof pendingTransform === "object")
    ) {
      const toCell = {
        x: Math.floor(pendingTransform.pos?.x ?? 0),
        y: Math.floor(pendingTransform.pos?.y ?? 0),
        z: Math.floor(pendingTransform.pos?.z ?? 0),
      };
      const moved = Game.systems.moveEditorBlock(
        worldRef,
        editor,
        entity,
        toCell
      );
      if (!moved) {
        if (currentTransform) {
          worldRef.components.Transform.set(entity, currentTransform);
        }
        return { ok: false, message: "Block move blocked." };
      }
      const nextTransform = {
        ...pendingTransform,
        pos: { x: toCell.x + 0.5, y: toCell.y, z: toCell.z + 0.5 },
      };
      worldRef.components.Transform.set(entity, nextTransform);
    } else {
      worldRef.components.Transform.set(entity, pendingTransform);
    }
  }
  return { ok: true };
};

Game.systems.exportLevelData = function exportLevelData(worldRef) {
  if (!worldRef) {
    return null;
  }
  const level = {
    gridSize: Game.config.gridSize,
  };

  const rendering = worldRef.resources?.rendering || {};
  const renderingOut = {};
  if (Number.isFinite(rendering.blockCullDistance)) {
    renderingOut.blockCullDistance = rendering.blockCullDistance;
  }
  if (Number.isFinite(rendering.blockCullFovPadding)) {
    renderingOut.blockCullFovPadding = rendering.blockCullFovPadding;
  }
  if (Number.isFinite(rendering.spriteCullDistance)) {
    renderingOut.spriteCullDistance = rendering.spriteCullDistance;
  }
  if (Number.isFinite(rendering.spriteCullFovPadding)) {
    renderingOut.spriteCullFovPadding = rendering.spriteCullFovPadding;
  }
  if (Number.isFinite(rendering.blockChunkSize)) {
    renderingOut.blockChunkSize = rendering.blockChunkSize;
  }
  if (Number.isFinite(rendering.blockAoStrength)) {
    renderingOut.blockAoStrength = rendering.blockAoStrength;
  }
  if (Number.isFinite(rendering.blockAoMin)) {
    renderingOut.blockAoMin = rendering.blockAoMin;
  }
  if (Number.isFinite(rendering.blockAoPower)) {
    renderingOut.blockAoPower = rendering.blockAoPower;
  }
  if (Number.isFinite(rendering.cameraNear)) {
    renderingOut.cameraNear = rendering.cameraNear;
  }
  if (Number.isFinite(rendering.cameraFar)) {
    renderingOut.cameraFar = rendering.cameraFar;
  }
  if (typeof rendering.cameraCutout === "boolean") {
    renderingOut.cameraCutout = rendering.cameraCutout;
  }
  if (Number.isFinite(rendering.cameraCutoutDepth)) {
    renderingOut.cameraCutoutDepth = rendering.cameraCutoutDepth;
  }
  if (Number.isFinite(rendering.cameraCutoutFade)) {
    renderingOut.cameraCutoutFade = rendering.cameraCutoutFade;
  }
  if (Number.isFinite(rendering.cameraCutoutNormalY)) {
    renderingOut.cameraCutoutNormalY = rendering.cameraCutoutNormalY;
  }
  if (Number.isFinite(rendering.cameraCutoutDitherScale)) {
    renderingOut.cameraCutoutDitherScale = rendering.cameraCutoutDitherScale;
  }
  if (Object.keys(renderingOut).length > 0) {
    level.rendering = renderingOut;
  }

  const streaming = worldRef.resources?.paintingStreaming;
  if (streaming) {
    level.paintingStreaming = {
      loadRadius: streaming.loadRadius,
      indicatorRadius: streaming.indicatorRadius,
      maxConcurrent: streaming.maxConcurrent,
      maxAnimatedConcurrent: streaming.maxAnimatedConcurrent,
      deferAnimatedWhileMoving: streaming.deferAnimatedWhileMoving,
      preloadAnimated: streaming.preloadAnimated,
      preloadAllPaintings: streaming.preloadAllPaintings,
    };
  }

  const blocks = [];
  if (worldRef.components?.StaticBlock) {
    for (const [entity] of worldRef.components.StaticBlock.entries()) {
      const transform = worldRef.components.Transform.get(entity);
      const renderable = worldRef.components.Renderable.get(entity);
      if (!transform?.pos) {
        continue;
      }
      const cell = {
        x: Math.floor(transform.pos.x),
        y: Math.floor(transform.pos.y),
        z: Math.floor(transform.pos.z),
      };
      const block = { ...cell };
      if (Array.isArray(renderable?.color)) {
        block.color = [...renderable.color];
      }
      blocks.push(block);
    }
  }
  blocks.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  level.blocks = blocks;

  const playerId = worldRef.resources?.playerId;
  if (playerId) {
    const transform = worldRef.components.Transform.get(playerId);
    const collider = worldRef.components.Collider.get(playerId);
    const sprite = worldRef.components.BillboardSprite.get(playerId);
    const speed = worldRef.components.Speed.get(playerId);
    const turnSpeed = worldRef.components.TurnSpeed.get(playerId);
    const jump = worldRef.components.Jump.get(playerId);
    const gravity = worldRef.components.Gravity.get(playerId);
    const label = worldRef.components.Label.get(playerId);
    const playerOut = {};
    if (transform?.pos) {
      playerOut.spawn = { ...transform.pos };
      if (Number.isFinite(transform.rotY)) {
        playerOut.yaw = transform.rotY;
      }
    }
    if (collider) {
      playerOut.size = { w: collider.w, d: collider.d, h: collider.h };
    }
    if (speed?.value !== undefined) {
      playerOut.speed = speed.value;
    }
    if (turnSpeed?.value !== undefined) {
      playerOut.turnSpeed = turnSpeed.value;
    }
    if (jump?.velocity !== undefined && gravity?.value) {
      playerOut.jumpHeight =
        (jump.velocity * jump.velocity) / (2 * gravity.value);
    }
    if (label?.text) {
      playerOut.label = label.text;
    }
    if (Array.isArray(label?.color)) {
      playerOut.labelColor = [...label.color];
    }
    if (label?.offsetY !== undefined) {
      playerOut.labelOffsetY = label.offsetY;
    }
    if (sprite) {
      playerOut.sprite = {
        frontKey: sprite.front,
        backKey: sprite.back,
        width: sprite.width,
        height: sprite.height,
        offsetY: sprite.offsetY,
        fps: sprite.fps,
        idleFrame: sprite.idleFrame,
        alphaCutoff: sprite.alphaCutoff,
      };
    }
    if (Object.keys(playerOut).length > 0) {
      level.player = playerOut;
    }
  }

  const cameraId = worldRef.resources?.cameraId;
  if (cameraId) {
    const follow = worldRef.components.CameraFollow.get(cameraId);
    if (follow) {
      level.camera = {
        distance: follow.distance,
        height: follow.height,
        lookHeight: follow.lookHeight,
        side: follow.side,
        smooth: follow.smooth,
        avoidStep: follow.avoidStep,
        avoidMax: follow.avoidMax,
        avoidPreferUp: follow.avoidPreferUp,
        avoidMinY: follow.avoidMinY,
        avoidMaxY: follow.avoidMaxY,
      };
    }
  }

  const npcs = [];
  if (worldRef.components?.NPC) {
    for (const [entity, npcData] of worldRef.components.NPC.entries()) {
      const transform = worldRef.components.Transform.get(entity);
      const collider = worldRef.components.Collider.get(entity);
      const renderable = worldRef.components.Renderable.get(entity);
      const sprite = worldRef.components.BillboardSprite.get(entity);
      const label = worldRef.components.Label.get(entity);
      const dialogue = worldRef.components.Dialogue.get(entity);
      const interaction = worldRef.components.Interaction.get(entity);
      const npcOut = {
        id: npcData?.id,
      };
      if (transform?.pos) {
        npcOut.spawn = { ...transform.pos };
        npcOut.yaw = transform.rotY ?? 0;
      }
      if (collider) {
        npcOut.size = { w: collider.w, d: collider.d, h: collider.h };
      }
      if (Array.isArray(renderable?.color)) {
        npcOut.color = [...renderable.color];
      }
      if (label?.text) {
        npcOut.label = label.text;
      }
      if (Array.isArray(label?.color)) {
        npcOut.labelColor = [...label.color];
      }
      if (label?.offsetY !== undefined) {
        npcOut.labelOffsetY = label.offsetY;
      }
      if (sprite) {
        npcOut.sprite = {
          frontKey: sprite.front,
          backKey: sprite.back,
          width: sprite.width,
          height: sprite.height,
          offsetY: sprite.offsetY,
          fps: sprite.fps,
          idleFrame: sprite.idleFrame,
          alphaCutoff: sprite.alphaCutoff,
        };
      }
      if (dialogue) {
        npcOut.dialogue = {
          name: dialogue.name,
          lines: dialogue.lines,
          color: dialogue.color,
          camera: dialogue.camera || null,
        };
      }
      if (interaction) {
        npcOut.interaction = {
          kind: interaction.kind,
          range: interaction.range,
          requireFacing: interaction.requireFacing,
          facingDot: interaction.facingDot,
          highlightColor: interaction.highlightColor,
          highlightScale: interaction.highlightScale,
          highlightThickness: interaction.highlightThickness,
        };
      }
      npcs.push(npcOut);
    }
  }
  level.npcs = npcs;

  const paintings = [];
  if (worldRef.components?.Painting) {
    for (const [entity, paintingData] of worldRef.components.Painting.entries()) {
      const transform = worldRef.components.Transform.get(entity);
      const collider = worldRef.components.Collider.get(entity);
      const renderable = worldRef.components.Renderable.get(entity);
      const sprite = worldRef.components.BillboardSprite.get(entity);
      const label = worldRef.components.Label.get(entity);
      const interaction = worldRef.components.Interaction.get(entity);
      const lightbox = worldRef.components.Lightbox.get(entity);
      if (!transform?.pos || !collider) {
        continue;
      }
      const anchorPos = {
        x: transform.pos.x - collider.w / 2,
        y: transform.pos.y,
        z: transform.pos.z - collider.d / 2,
      };
      const paintingOut = {
        id: paintingData?.id,
        textureKey: paintingData?.textureKey || paintingData?.id,
        pos: anchorPos,
        width: collider.w,
        height: collider.h,
        depth: collider.d,
        yaw: transform.rotY ?? 0,
      };
      if (paintingData?.image) {
        paintingOut.image = paintingData.image;
      }
      if (paintingData?.loadRadius !== undefined && paintingData?.loadRadius !== null) {
        paintingOut.loadRadius = paintingData.loadRadius;
      }
      if (
        paintingData?.indicatorRadius !== undefined &&
        paintingData?.indicatorRadius !== null
      ) {
        paintingOut.indicatorRadius = paintingData.indicatorRadius;
      }
      if (Array.isArray(renderable?.color)) {
        paintingOut.color = [...renderable.color];
      }
      if (sprite) {
        paintingOut.frontKey = sprite.front;
        paintingOut.backKey = sprite.back;
        paintingOut.offsetY = sprite.offsetY;
        paintingOut.fps = sprite.fps;
        paintingOut.idleFrame = sprite.idleFrame;
        paintingOut.alphaCutoff = sprite.alphaCutoff;
        paintingOut.billboard = sprite.billboard;
        paintingOut.animate = sprite.animate;
      }
      if (label?.text) {
        paintingOut.label = label.text;
      }
      if (Array.isArray(label?.color)) {
        paintingOut.labelColor = [...label.color];
      }
      if (label?.offsetY !== undefined) {
        paintingOut.labelOffsetY = label.offsetY;
      }
      if (interaction) {
        paintingOut.interaction = {
          kind: interaction.kind,
          range: interaction.range,
          requireFacing: interaction.requireFacing,
          facingDot: interaction.facingDot,
          highlightColor: interaction.highlightColor,
          highlightScale: interaction.highlightScale,
          highlightThickness: interaction.highlightThickness,
        };
      }
      if (lightbox) {
        paintingOut.lightbox = {
          distanceScale: lightbox.distanceScale,
          distanceOffset: lightbox.distanceOffset,
          yOffset: lightbox.yOffset,
          smooth: lightbox.smooth,
        };
      }
      paintings.push(paintingOut);
    }
  }
  level.paintings = paintings;

  return level;
};

Game.systems.getEditorHandleConfig = function getEditorHandleConfig(
  worldRef,
  editor,
  selection
) {
  if (!worldRef || !selection) {
    return null;
  }
  const transform = worldRef.components.Transform.get(selection.entity);
  const collider = worldRef.components.Collider.get(selection.entity);
  if (!transform || !collider) {
    return null;
  }
  const center = {
    x: transform.pos.x,
    y: transform.pos.y + collider.h / 2,
    z: transform.pos.z,
  };
  const size = Math.max(collider.w, collider.h, collider.d);
  const handleLength =
    editor?.handleLength && editor.handleLength > 0
      ? editor.handleLength
      : size * 0.7 + 0.35;
  const handleRadius = editor?.handleRadius ?? 0.12;
  const rotateRadius =
    editor?.rotateHandleRadius && editor.rotateHandleRadius > 0
      ? editor.rotateHandleRadius
      : Math.max(collider.w, collider.d) * 0.7 + 0.35;
  const rotateThickness = editor?.rotateHandleThickness ?? 0.12;
  return {
    center,
    handleLength,
    handleRadius,
    rotateRadius,
    rotateThickness,
  };
};

Game.systems.rayClosestPointToAxis = function rayClosestPointToAxis(
  rayOrigin,
  rayDir,
  axisOrigin,
  axisDir
) {
  const r = {
    x: axisOrigin.x - rayOrigin.x,
    y: axisOrigin.y - rayOrigin.y,
    z: axisOrigin.z - rayOrigin.z,
  };
  const a = axisDir.x * axisDir.x + axisDir.y * axisDir.y + axisDir.z * axisDir.z;
  const e = rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z;
  const b = axisDir.x * rayDir.x + axisDir.y * rayDir.y + axisDir.z * rayDir.z;
  const c = axisDir.x * r.x + axisDir.y * r.y + axisDir.z * r.z;
  const f = rayDir.x * r.x + rayDir.y * r.y + rayDir.z * r.z;
  const denom = a * e - b * b;
  if (Math.abs(denom) < 1e-6) {
    return null;
  }
  const t = (b * f - c * e) / denom;
  const u = (a * f - b * c) / denom;
  const axisPoint = {
    x: axisOrigin.x + axisDir.x * t,
    y: axisOrigin.y + axisDir.y * t,
    z: axisOrigin.z + axisDir.z * t,
  };
  const rayPoint = {
    x: rayOrigin.x + rayDir.x * u,
    y: rayOrigin.y + rayDir.y * u,
    z: rayOrigin.z + rayDir.z * u,
  };
  const dx = axisPoint.x - rayPoint.x;
  const dy = axisPoint.y - rayPoint.y;
  const dz = axisPoint.z - rayPoint.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  return { t, u, distSq, axisPoint };
};

Game.systems.pickEditorHandle = function pickEditorHandle(
  worldRef,
  editor,
  selection,
  ray
) {
  const config = Game.systems.getEditorHandleConfig(worldRef, editor, selection);
  if (!config) {
    return null;
  }
  const axes = [
    { axis: "x", dir: { x: 1, y: 0, z: 0 } },
    { axis: "y", dir: { x: 0, y: 1, z: 0 } },
    { axis: "z", dir: { x: 0, y: 0, z: 1 } },
  ];
  let best = null;
  for (const handle of axes) {
    const hit = Game.systems.rayClosestPointToAxis(
      ray.origin,
      ray.dir,
      config.center,
      handle.dir
    );
    if (!hit || hit.u < 0) {
      continue;
    }
    if (hit.t < 0 || hit.t > config.handleLength) {
      continue;
    }
    if (hit.distSq > config.handleRadius * config.handleRadius) {
      continue;
    }
    if (!best || hit.distSq < best.distSq) {
      best = {
        type: "axis",
        axis: handle.axis,
        origin: config.center,
        dir: handle.dir,
        distSq: hit.distSq,
      };
    }
  }
  const isRotatable =
    selection.type === "entity" &&
    Game.systems.isEditorMovableEntity(worldRef, selection.entity);
  if (isRotatable) {
    const planePoint = Game.systems.intersectRayPlaneY(
      ray,
      config.center.y
    );
    if (planePoint) {
      const dx = planePoint.x - config.center.x;
      const dz = planePoint.z - config.center.z;
      const dist = Math.hypot(dx, dz);
      if (
        dist >= config.rotateRadius - config.rotateThickness &&
        dist <= config.rotateRadius + config.rotateThickness
      ) {
        return {
          type: "rotate",
          center: config.center,
          radius: config.rotateRadius,
        };
      }
    }
  }
  return best;
};

Game.systems.addEditorBlock = function addEditorBlock(
  worldRef,
  x,
  y,
  z,
  color
) {
  if (!worldRef || !worldRef.resources) {
    return false;
  }
  if (Game.utils.isBlockAt(worldRef, x, y, z)) {
    return false;
  }
  const blockEntity = Game.ecs.createEntity(worldRef);
  Game.ecs.addComponent(worldRef, "Transform", blockEntity, {
    pos: { x: x + 0.5, y, z: z + 0.5 },
    rotY: 0,
  });
  Game.ecs.addComponent(worldRef, "Collider", blockEntity, {
    w: 1,
    d: 1,
    h: 1,
  });
  Game.ecs.addComponent(worldRef, "Renderable", blockEntity, {
    color: color || [110, 145, 110],
    kind: "block",
  });
  Game.ecs.addComponent(worldRef, "StaticBlock", blockEntity, {});
  const key = Game.utils.blockKey(x, y, z);
  worldRef.resources.blockSet.add(key);
  if (worldRef.resources.blockIndex) {
    worldRef.resources.blockIndex.set(key, blockEntity);
  }
  const editor = worldRef.resources.editor;
  if (editor?.blockIndex) {
    editor.blockIndex.set(key, blockEntity);
  }
  Game.rendering?.markBlockChunkDirtyAround?.(worldRef, x, y, z);
  return true;
};

Game.systems.moveEditorBlock = function moveEditorBlock(
  worldRef,
  editor,
  entity,
  toCell
) {
  if (!worldRef || !entity || !toCell) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (!transform || !transform.pos) {
    return false;
  }
  const fromCell = {
    x: Math.floor(transform.pos.x),
    y: Math.floor(transform.pos.y),
    z: Math.floor(transform.pos.z),
  };
  if (
    fromCell.x === toCell.x &&
    fromCell.y === toCell.y &&
    fromCell.z === toCell.z
  ) {
    return false;
  }
  const toKey = Game.utils.blockKey(toCell.x, toCell.y, toCell.z);
  const existing = editor?.blockIndex?.get(toKey);
  if (existing && existing !== entity) {
    return false;
  }
  const fromKey = Game.utils.blockKey(fromCell.x, fromCell.y, fromCell.z);
  worldRef.resources.blockSet.delete(fromKey);
  worldRef.resources.blockSet.add(toKey);
  if (worldRef.resources.blockIndex) {
    worldRef.resources.blockIndex.delete(fromKey);
    worldRef.resources.blockIndex.set(toKey, entity);
  }
  if (editor?.blockIndex) {
    editor.blockIndex.delete(fromKey);
    editor.blockIndex.set(toKey, entity);
  }
  transform.pos.x = toCell.x + 0.5;
  transform.pos.y = toCell.y;
  transform.pos.z = toCell.z + 0.5;
  worldRef.components.Transform.set(entity, transform);
  Game.rendering?.markBlockChunkDirtyAround?.(
    worldRef,
    fromCell.x,
    fromCell.y,
    fromCell.z
  );
  Game.rendering?.markBlockChunkDirtyAround?.(
    worldRef,
    toCell.x,
    toCell.y,
    toCell.z
  );
  return true;
};

Game.systems.moveEditorEntity = function moveEditorEntity(
  worldRef,
  entity,
  toCell,
  planeY
) {
  if (!worldRef || !entity || !toCell) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (!transform || !transform.pos) {
    return false;
  }
  const nextX = toCell.x + 0.5;
  const nextZ = toCell.z + 0.5;
  if (transform.pos.x === nextX && transform.pos.z === nextZ) {
    return false;
  }
  transform.pos.x = nextX;
  transform.pos.z = nextZ;
  if (typeof planeY === "number") {
    transform.pos.y = planeY;
  }
  worldRef.components.Transform.set(entity, transform);
  return true;
};

Game.systems.setEditorEntityPosition = function setEditorEntityPosition(
  worldRef,
  entity,
  pos
) {
  if (!worldRef || !entity || !pos) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (!transform || !transform.pos) {
    return false;
  }
  transform.pos.x = pos.x;
  transform.pos.y = pos.y;
  transform.pos.z = pos.z;
  worldRef.components.Transform.set(entity, transform);
  return true;
};

Game.systems.setEditorEntityRotation = function setEditorEntityRotation(
  worldRef,
  entity,
  rotY
) {
  if (!worldRef || !entity || typeof rotY !== "number") {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (!transform) {
    return false;
  }
  transform.rotY = rotY;
  worldRef.components.Transform.set(entity, transform);
  return true;
};

Game.systems.deleteEditorBlock = function deleteEditorBlock(
  worldRef,
  editor,
  entity
) {
  if (!worldRef || !entity) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (transform?.pos) {
    const cell = {
      x: Math.floor(transform.pos.x),
      y: Math.floor(transform.pos.y),
      z: Math.floor(transform.pos.z),
    };
    const key = Game.utils.blockKey(cell.x, cell.y, cell.z);
    worldRef.resources?.blockSet?.delete(key);
    worldRef.resources?.blockIndex?.delete(key);
    editor?.blockIndex?.delete(key);
    Game.rendering?.markBlockChunkDirtyAround?.(
      worldRef,
      cell.x,
      cell.y,
      cell.z
    );
  }
  Game.ecs.removeEntity(worldRef, entity);
  return true;
};

Game.systems.deleteSelectedEditorBlock =
  function deleteSelectedEditorBlock(worldRef) {
    const editor = worldRef?.resources?.editor;
    const entity = editor?.selectedEntity;
    if (!editor || !entity) {
      return false;
    }
    const removed = Game.systems.deleteEditorBlock(worldRef, editor, entity);
    if (removed) {
      editor.selectedEntity = null;
      editor.selectedCell = null;
    }
    return removed;
  };

Game.systems.intersectRayPlaneY = function intersectRayPlaneY(ray, planeY) {
  if (!ray || !ray.origin || !ray.dir) {
    return null;
  }
  const denom = ray.dir.y;
  if (Math.abs(denom) < 1e-6) {
    return null;
  }
  const t = (planeY - ray.origin.y) / denom;
  if (t < 0) {
    return null;
  }
  return {
    x: ray.origin.x + ray.dir.x * t,
    y: ray.origin.y + ray.dir.y * t,
    z: ray.origin.z + ray.dir.z * t,
  };
};

Game.systems.editorSystem = function editorSystem(worldRef) {
  const editor = Game.systems.ensureEditorState(worldRef);
  if (!editor || !editor.enabled) {
    return;
  }
  const mode = Game.debug?.mode ?? 0;
  if (editor.lastMode !== mode) {
    editor.hoveredBlock = null;
    editor.hoveredEntity = null;
    editor.selectedCell = null;
    editor.selectedEntity = null;
    editor.selectedEntityId = null;
    editor.pointerDown = false;
    editor.pointerHeld = false;
    editor.pointerHit = null;
    editor.pointerEntityHit = null;
    editor.pointerTargetType = null;
    editor.activeHandle = null;
    editor.handleRotateOffset = 0;
    editor.dragActive = false;
    editor.dragEntity = null;
    editor.dragCell = null;
    editor.dragEntityCell = null;
    editor.lastMode = mode;
  }
  if (mode <= 0) {
    return;
  }
  const selection = Game.systems.getEditorSelection(worldRef, editor);
  Game.systems.ensureEditorBlockIndex(worldRef, editor);
  if (
    typeof mouseX !== "number" ||
    typeof mouseY !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    editor.hoveredBlock = null;
    editor.hoveredEntity = null;
    return;
  }
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) {
    editor.hoveredBlock = null;
    editor.hoveredEntity = null;
    return;
  }
  const ray = Game.systems.getCameraRayFromScreen(worldRef, mouseX, mouseY);
  if (!ray) {
    editor.hoveredBlock = null;
    editor.hoveredEntity = null;
    return;
  }
  const blockHit = Game.systems.raycastBlocks(
    worldRef,
    ray,
    editor.hoverMaxDistance
  );
  const entityHit =
    mode === 2
      ? Game.systems.pickEditorEntity(
          worldRef,
          ray,
          editor.hoverMaxDistance
        )
      : null;
  let hoverType = null;
  if (entityHit && (!blockHit || entityHit.distance <= blockHit.distance)) {
    hoverType = "entity";
  } else if (blockHit) {
    hoverType = "block";
  }
  editor.hoveredBlock =
    hoverType === "block" && blockHit
      ? { x: blockHit.x, y: blockHit.y, z: blockHit.z }
      : null;
  editor.hoveredEntity = hoverType === "entity" ? entityHit.entity : null;
  editor.lastRay = {
    origin: { ...ray.origin },
    dir: { ...ray.dir },
    hit: hoverType === "block" ? blockHit : entityHit,
  };

  const input = Game.systems.inputState;
  const leftDown =
    !!input?.mouseDown ||
    (typeof mouseIsPressed !== "undefined" &&
      mouseIsPressed &&
      (typeof mouseButton === "undefined" || mouseButton === LEFT));
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  if (leftDown && !editor.pointerDown) {
    editor.pointerDown = true;
    editor.pointerDownAt = now;
    editor.pointerHeld = false;
    editor.dragActive = false;
    editor.dragEntity = null;
    editor.dragCell = null;
    editor.dragEntityCell = null;
    editor.pointerTargetType = null;
    editor.activeHandle = null;
    editor.pointerStart = input?.mouseDownPosition
      ? { ...input.mouseDownPosition }
      : { x: mouseX, y: mouseY };
    const downRay = Game.systems.getCameraRayFromScreen(
      worldRef,
      editor.pointerStart.x,
      editor.pointerStart.y
    );
    if (selection) {
      const handleHit = downRay
        ? Game.systems.pickEditorHandle(worldRef, editor, selection, downRay)
        : null;
      if (handleHit) {
        editor.pointerTargetType = "handle";
        editor.pointerHeld = true;
        editor.dragActive = true;
        editor.activeHandle = handleHit;
        if (handleHit.type === "rotate" && selection.type === "entity") {
          const transform = worldRef.components.Transform.get(selection.entity);
          if (transform) {
            const planePoint = Game.systems.intersectRayPlaneY(
              downRay,
              handleHit.center.y
            );
            if (planePoint) {
              const angle = Math.atan2(
                planePoint.x - handleHit.center.x,
                planePoint.z - handleHit.center.z
              );
              editor.handleRotateOffset = transform.rotY - angle;
            } else {
              editor.handleRotateOffset = 0;
            }
          }
        }
      }
    }
    editor.pointerHit = downRay
      ? Game.systems.raycastBlocks(worldRef, downRay, editor.hoverMaxDistance)
      : null;
    editor.pointerEntityHit =
      downRay && mode === 2
        ? Game.systems.pickEditorEntity(
            worldRef,
            downRay,
            editor.hoverMaxDistance
          )
        : null;
    if (
      editor.pointerEntityHit &&
      (!editor.pointerHit ||
        editor.pointerEntityHit.distance <= editor.pointerHit.distance)
    ) {
      if (editor.pointerTargetType !== "handle") {
        editor.pointerTargetType = "entity";
      }
    } else if (editor.pointerHit) {
      if (editor.pointerTargetType !== "handle") {
        editor.pointerTargetType = "block";
      }
    }
    if (editor.consumeClicks && input) {
      input.clickRequested = false;
      input.clickPosition = null;
    }
  }

  if (!leftDown && editor.pointerDown) {
    if (editor.pointerTargetType === "handle") {
      editor.pointerDown = false;
      editor.pointerStart = null;
      editor.pointerHit = null;
      editor.pointerEntityHit = null;
      editor.pointerTargetType = null;
      editor.pointerHeld = false;
      editor.dragActive = false;
      editor.dragEntity = null;
      editor.dragCell = null;
      editor.dragEntityCell = null;
      editor.activeHandle = null;
      return;
    }
    if (
      editor.pointerTargetType === "block" &&
      !editor.dragActive &&
      !editor.pointerHeld &&
      editor.pointerHit?.normal
    ) {
      const place = {
        x: editor.pointerHit.x + editor.pointerHit.normal.x,
        y: editor.pointerHit.y + editor.pointerHit.normal.y,
        z: editor.pointerHit.z + editor.pointerHit.normal.z,
      };
      Game.systems.addEditorBlock(
        worldRef,
        place.x,
        place.y,
        place.z,
        editor.blockColor
      );
    }
    editor.pointerDown = false;
    editor.pointerStart = null;
    editor.pointerHit = null;
    editor.pointerEntityHit = null;
    editor.pointerTargetType = null;
    editor.pointerHeld = false;
    editor.dragActive = false;
    editor.dragEntity = null;
    editor.dragCell = null;
    editor.dragEntityCell = null;
    editor.activeHandle = null;
  }

  if (editor.pointerDown) {
    if (editor.pointerTargetType === "handle" && editor.activeHandle) {
      const dragRay = Game.systems.getCameraRayFromScreen(
        worldRef,
        mouseX,
        mouseY
      );
      if (!dragRay) {
        return;
      }
      if (editor.activeHandle.type === "axis" && selection) {
        const hit = Game.systems.rayClosestPointToAxis(
          dragRay.origin,
          dragRay.dir,
          editor.activeHandle.origin,
          editor.activeHandle.dir
        );
        if (hit) {
          const point = hit.axisPoint;
          if (selection.type === "block") {
            const cell = {
              x: Math.floor(point.x),
              y: Math.floor(point.y),
              z: Math.floor(point.z),
            };
            const targetCell = {
              x: editor.selectedCell?.x ?? cell.x,
              y: editor.selectedCell?.y ?? cell.y,
              z: editor.selectedCell?.z ?? cell.z,
            };
            if (editor.activeHandle.axis === "x") {
              targetCell.x = Math.round(point.x - 0.5);
            } else if (editor.activeHandle.axis === "y") {
              targetCell.y = Math.round(point.y - 0.5);
            } else {
              targetCell.z = Math.round(point.z - 0.5);
            }
            if (
              Game.systems.moveEditorBlock(
                worldRef,
                editor,
                selection.entity,
                targetCell
              )
            ) {
              editor.selectedCell = { ...targetCell };
              editor.hoveredBlock = { ...targetCell };
            }
          } else if (selection.type === "entity") {
            const transform = worldRef.components.Transform.get(selection.entity);
            if (transform?.pos) {
              const next = {
                x: transform.pos.x,
                y: transform.pos.y,
                z: transform.pos.z,
              };
              if (editor.activeHandle.axis === "x") {
                next.x = Math.round(point.x - 0.5) + 0.5;
              } else if (editor.activeHandle.axis === "y") {
                next.y = Math.round(point.y);
              } else {
                next.z = Math.round(point.z - 0.5) + 0.5;
              }
              Game.systems.setEditorEntityPosition(
                worldRef,
                selection.entity,
                next
              );
              editor.hoveredEntity = selection.entity;
            }
          }
        }
      } else if (editor.activeHandle.type === "rotate" && selection?.type === "entity") {
        const planePoint = Game.systems.intersectRayPlaneY(
          dragRay,
          editor.activeHandle.center.y
        );
        if (planePoint) {
          const angle = Math.atan2(
            planePoint.x - editor.activeHandle.center.x,
            planePoint.z - editor.activeHandle.center.z
          );
          const nextRot = angle + (editor.handleRotateOffset ?? 0);
          const snapStep = Math.PI / 4;
          const snappedRot = Math.round(nextRot / snapStep) * snapStep;
          Game.systems.setEditorEntityRotation(
            worldRef,
            selection.entity,
            snappedRot
          );
          editor.hoveredEntity = selection.entity;
        }
      }
      return;
    }
    if (!editor.pointerHeld) {
      const heldLong = now - (editor.pointerDownAt || now) >= (editor.holdDelay ?? 200);
      if (heldLong) {
        editor.pointerHeld = true;
        if (editor.pointerTargetType === "entity") {
          editor.selectedEntityId = editor.pointerEntityHit?.entity || null;
          editor.selectedCell = null;
          editor.selectedEntity = null;
        } else if (editor.pointerHit) {
          const cell = {
            x: editor.pointerHit.x,
            y: editor.pointerHit.y,
            z: editor.pointerHit.z,
          };
          const entity = Game.systems.getEditorBlockEntityAt(
            editor,
            cell.x,
            cell.y,
            cell.z
          );
          editor.selectedCell = entity ? cell : null;
          editor.selectedEntity = entity || null;
          editor.selectedEntityId = null;
        } else {
          editor.selectedCell = null;
          editor.selectedEntity = null;
          editor.selectedEntityId = null;
        }
      }
    }

    if (editor.pointerHeld && editor.pointerTargetType === "entity" && editor.selectedEntityId) {
      const dx = mouseX - editor.pointerStart.x;
      const dy = mouseY - editor.pointerStart.y;
      const moved = Math.hypot(dx, dy);
      if (!editor.dragActive && moved > (editor.dragThreshold ?? 6)) {
        const transform = worldRef.components.Transform.get(
          editor.selectedEntityId
        );
        editor.dragActive = true;
        editor.dragEntity = editor.selectedEntityId;
        editor.dragEntityCell = transform?.pos
          ? {
              x: Math.floor(transform.pos.x),
              z: Math.floor(transform.pos.z),
            }
          : null;
        editor.dragPlaneY = transform?.pos ? transform.pos.y : 0;
      }

      if (editor.dragActive) {
        const dragRay = Game.systems.getCameraRayFromScreen(
          worldRef,
          mouseX,
          mouseY
        );
        if (dragRay) {
          const planePoint = Game.systems.intersectRayPlaneY(
            dragRay,
            editor.dragPlaneY ?? 0
          );
          if (planePoint) {
            const targetCell = {
              x: Math.floor(planePoint.x),
              z: Math.floor(planePoint.z),
            };
            if (
              !editor.dragEntityCell ||
              editor.dragEntityCell.x !== targetCell.x ||
              editor.dragEntityCell.z !== targetCell.z
            ) {
              if (
                Game.systems.moveEditorEntity(
                  worldRef,
                  editor.dragEntity,
                  targetCell,
                  editor.dragPlaneY
                )
              ) {
                editor.dragEntityCell = targetCell;
                editor.hoveredEntity = editor.dragEntity;
              }
            }
          }
        }
      }
    } else if (editor.pointerHeld && editor.selectedEntity) {
      const dx = mouseX - editor.pointerStart.x;
      const dy = mouseY - editor.pointerStart.y;
      const moved = Math.hypot(dx, dy);
      if (!editor.dragActive && moved > (editor.dragThreshold ?? 6)) {
        editor.dragActive = true;
        editor.dragEntity = editor.selectedEntity;
        editor.dragCell = { ...editor.selectedCell };
        editor.dragPlaneY = editor.dragCell.y + 0.5;
      }

      if (editor.dragActive) {
        const dragRay = Game.systems.getCameraRayFromScreen(
          worldRef,
          mouseX,
          mouseY
        );
        if (dragRay) {
          const planePoint = Game.systems.intersectRayPlaneY(
            dragRay,
            editor.dragPlaneY ?? 0
          );
          if (planePoint && editor.dragCell) {
            const targetCell = {
              x: Math.floor(planePoint.x),
              y: editor.dragCell.y,
              z: Math.floor(planePoint.z),
            };
            if (
              Game.systems.moveEditorBlock(
                worldRef,
                editor,
                editor.dragEntity,
                targetCell
              )
            ) {
              editor.dragCell = targetCell;
              editor.selectedCell = { ...targetCell };
              editor.hoveredBlock = targetCell;
            }
          }
        }
      }
    }
  }
};

Game.systems.drawEditorHover = function drawEditorHover(worldRef) {
  const editor = worldRef?.resources?.editor;
  if (!editor || !editor.enabled) {
    return;
  }
  const hoveredEntity = editor.hoveredEntity;
  if (hoveredEntity) {
    Game.systems.drawEditorEntityBox(
      worldRef,
      hoveredEntity,
      editor.hoverColor || [255, 200, 120],
      editor.hoverThickness ?? 2,
      editor.hoverScale ?? 1.02
    );
  }
  const hovered = editor.hoveredBlock;
  if (!hovered) {
    return;
  }

  const size = Game.config.gridSize;
  const center = {
    x: hovered.x + 0.5,
    y: hovered.y + 0.5,
    z: hovered.z + 0.5,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const color = editor.hoverColor || [255, 200, 120];
  const thickness = editor.hoverThickness ?? 2;
  const scale = editor.hoverScale ?? 1.02;

  resetShader();
  blendMode(BLEND);
  noLights();

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noFill();
  stroke(color[0], color[1], color[2]);
  strokeWeight(thickness);
  box(size * scale, size * scale, size * scale);
  pop();
};

Game.systems.drawEditorSelection = function drawEditorSelection(worldRef) {
  const editor = worldRef?.resources?.editor;
  if (!editor || !editor.enabled) {
    return;
  }
  const selectedEntity = editor.selectedEntityId;
  if (selectedEntity) {
    Game.systems.drawEditorEntityBox(
      worldRef,
      selectedEntity,
      editor.selectedColor || [120, 220, 255],
      editor.selectedThickness ?? 3,
      editor.selectedScale ?? 1.08
    );
  }
  const selected = editor.selectedCell;
  if (!selected) {
    Game.systems.drawEditorGizmos?.(worldRef, editor);
    return;
  }
  const size = Game.config.gridSize;
  const center = {
    x: selected.x + 0.5,
    y: selected.y + 0.5,
    z: selected.z + 0.5,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const color = editor.selectedColor || [120, 220, 255];
  const thickness = editor.selectedThickness ?? 3;
  const scale = editor.selectedScale ?? 1.08;

  resetShader();
  blendMode(BLEND);
  noLights();

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noFill();
  stroke(color[0], color[1], color[2]);
  strokeWeight(thickness);
  box(size * scale, size * scale, size * scale);
  pop();

  Game.systems.drawEditorGizmos?.(worldRef, editor);
};

Game.systems.drawEditorEntityBox = function drawEditorEntityBox(
  worldRef,
  entity,
  color,
  thickness,
  scale
) {
  const transform = worldRef?.components?.Transform?.get(entity);
  const collider = worldRef?.components?.Collider?.get(entity);
  if (!transform || !collider) {
    return;
  }
  const size = Game.config.gridSize;
  const center = {
    x: transform.pos.x,
    y: transform.pos.y + collider.h / 2,
    z: transform.pos.z,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const s = typeof scale === "number" ? scale : 1;

  resetShader();
  blendMode(BLEND);
  noLights();

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noFill();
  stroke(color[0], color[1], color[2]);
  strokeWeight(thickness);
  box(
    collider.w * size * s,
    collider.h * size * s,
    collider.d * size * s
  );
  pop();
};

Game.systems.drawEditorGizmos = function drawEditorGizmos(worldRef, editor) {
  const selection = Game.systems.getEditorSelection(worldRef, editor);
  if (!selection) {
    return;
  }
  const config = Game.systems.getEditorHandleConfig(worldRef, editor, selection);
  if (!config) {
    return;
  }
  const size = Game.config.gridSize;
  const handleSize = size * 0.12;
  const centerWorld = Game.utils.gameToWorld(config.center);
  const axes = [
    { axis: "x", dir: { x: 1, y: 0, z: 0 }, color: [255, 90, 90] },
    { axis: "y", dir: { x: 0, y: 1, z: 0 }, color: [90, 255, 90] },
    { axis: "z", dir: { x: 0, y: 0, z: 1 }, color: [90, 140, 255] },
  ];

  resetShader();
  blendMode(BLEND);
  noLights();

  for (const axis of axes) {
    const end = {
      x: config.center.x + axis.dir.x * config.handleLength,
      y: config.center.y + axis.dir.y * config.handleLength,
      z: config.center.z + axis.dir.z * config.handleLength,
    };
    const endWorld = Game.utils.gameToWorld(end);
    stroke(axis.color[0], axis.color[1], axis.color[2]);
    strokeWeight(2);
    line(
      centerWorld.x,
      centerWorld.y,
      centerWorld.z,
      endWorld.x,
      endWorld.y,
      endWorld.z
    );
    push();
    translate(endWorld.x, endWorld.y, endWorld.z);
    noFill();
    box(handleSize, handleSize, handleSize);
    pop();
  }

  const canRotate =
    selection.type === "entity" &&
    Game.systems.isEditorMovableEntity(worldRef, selection.entity);
  if (canRotate) {
    const ringColor = [255, 200, 80];
    stroke(ringColor[0], ringColor[1], ringColor[2]);
    strokeWeight(2);
    noFill();
    beginShape();
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const point = {
        x: config.center.x + Math.cos(angle) * config.rotateRadius,
        y: config.center.y,
        z: config.center.z + Math.sin(angle) * config.rotateRadius,
      };
      const worldPos = Game.utils.gameToWorld(point);
      vertex(worldPos.x, worldPos.y, worldPos.z);
    }
    endShape();
  }
};
