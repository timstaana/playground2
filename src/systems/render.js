window.Game = window.Game || {};
Game.systems = Game.systems || {};
Game.rendering = Game.rendering || {};

Game.systems.renderSystem = function renderSystem(worldRef, renderState) {
  ambientLight(150);
  directionalLight(255, 255, 255, 0.3, -1, -0.4);

  noStroke();

  const cameraTransform = worldRef.components.Transform.get(
    worldRef.resources.cameraId
  );
  const cameraPos = cameraTransform?.pos || { x: 0, y: 0, z: 0 };
  const cameraWorld = Game.utils.gameToWorld(cameraPos);
  const cameraEntity = worldRef.resources.cameraId;
  const follow = cameraEntity
    ? worldRef.components.CameraFollow.get(cameraEntity)
    : null;
  let viewDir = { x: 0, y: 0, z: -1 };
  if (follow) {
    const targetTransform = worldRef.components.Transform.get(follow.target);
    if (targetTransform) {
      const lookAt = {
        x: targetTransform.pos.x,
        y: targetTransform.pos.y + follow.lookHeight,
        z: targetTransform.pos.z,
      };
      const dir = {
        x: lookAt.x - cameraPos.x,
        y: lookAt.y - cameraPos.y,
        z: lookAt.z - cameraPos.z,
      };
      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      viewDir = {
        x: dir.x / len,
        y: dir.y / len,
        z: dir.z / len,
      };
    }
  }
  const occluderMap = Game.rendering.computeOccluders(worldRef, cameraPos);
  const occluderBlocks = [];
  const spriteDraws = [];

  for (const [entity, renderable] of worldRef.components.Renderable.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }

    const sprite = worldRef.components.BillboardSprite.get(entity);
    if (sprite) {
      const vel = worldRef.components.Velocity.get(entity);
      const horizontalSpeed = vel ? Math.hypot(vel.x, vel.z) : 0;
      const isMoving = horizontalSpeed > 0.01;
      const shouldAnimate = sprite.animate ? true : isMoving;
      const toCam = {
        x: cameraPos.x - transform.pos.x,
        z: cameraPos.z - transform.pos.z,
      };
      const toCamLen = Math.hypot(toCam.x, toCam.z) || 1;
      toCam.x /= toCamLen;
      toCam.z /= toCamLen;

      const forward = {
        x: Math.sin(transform.rotY),
        z: -Math.cos(transform.rotY),
      };
      const isFront = forward.x * toCam.x + forward.z * toCam.z > 0;
      const textureKey = isFront ? sprite.front : sprite.back;
      const spriteTex = worldRef.resources.textures[textureKey];
      const tex = spriteTex ? spriteTex.texture : null;

      const center = {
        x: transform.pos.x,
        y: transform.pos.y + sprite.offsetY,
        z: transform.pos.z,
      };
      const worldPos = Game.utils.gameToWorld(center);
      let billboardYaw = transform.rotY;
      let billboardPitch = sprite.pitch ?? 0;
      if (sprite.billboard !== false) {
        const toCamWorld = {
          x: cameraWorld.x - worldPos.x,
          y: cameraWorld.y - worldPos.y,
          z: cameraWorld.z - worldPos.z,
        };
        const horiz = Math.hypot(toCamWorld.x, toCamWorld.z);
        billboardYaw = Math.atan2(toCamWorld.x, toCamWorld.z);
        billboardPitch = Math.atan2(toCamWorld.y, horiz || 1);
      }
      const depth =
        (center.x - cameraPos.x) * viewDir.x +
        (center.y - cameraPos.y) * viewDir.y +
        (center.z - cameraPos.z) * viewDir.z;

      if (spriteTex && Game.rendering.isValidTexture(tex)) {
        const isPainting = worldRef.components.Painting.has(entity);
        const highlight = worldRef.components.Highlight.get(entity);
        const outline =
          highlight && Array.isArray(highlight.color)
            ? {
                color: highlight.color,
                thickness: highlight.thickness,
              }
            : null;
        spriteDraws.push({
          sprite,
          spriteTex,
          tex,
          worldPos,
          billboardYaw,
          billboardPitch,
          isMoving: shouldAnimate,
          outline,
          isPainting,
          depth,
        });
        continue;
      }

      if (worldRef.components.Painting.has(entity)) {
        continue;
      }
    }

    const center = {
      x: transform.pos.x,
      y: transform.pos.y + collider.h / 2,
      z: transform.pos.z,
    };
    const worldPos = Game.utils.gameToWorld(center);

    if (worldRef.components.StaticBlock.has(entity)) {
      const staticBlock = worldRef.components.StaticBlock.get(entity);
      const cellX = Math.floor(transform.pos.x);
      const cellY = Math.floor(transform.pos.y);
      const cellZ = Math.floor(transform.pos.z);
      const occluderAlpha = occluderMap.get(
        Game.utils.blockKey(cellX, cellY, cellZ)
      );
      if (occluderAlpha !== undefined) {
        occluderBlocks.push({
          worldPos,
          collider,
          color: renderable.color,
          alpha: occluderAlpha,
        });
        continue;
      }
      Game.rendering.drawBlockWithVertexAO(
        worldRef,
        transform,
        collider,
        renderable,
        staticBlock,
        cellX,
        cellY,
        cellZ
      );
      continue;
    }

    push();
    translate(worldPos.x, worldPos.y, worldPos.z);
    fill(renderable.color[0], renderable.color[1], renderable.color[2]);
    box(
      collider.w * Game.config.gridSize,
      collider.h * Game.config.gridSize,
      collider.d * Game.config.gridSize
    );
    pop();
  }

  if (occluderBlocks.length > 0 && renderState?.occluderShader) {
    shader(renderState.occluderShader);
    blendMode(REPLACE);
    renderState.occluderShader.setUniform(
      "uDitherScale",
      worldRef.resources.rendering.occluderDitherScale ?? 1
    );
    renderState.occluderShader.setUniform(
      "uAmbient",
      worldRef.resources.rendering.occluderAmbient ?? 150 / 255
    );
    for (const block of occluderBlocks) {
      const color = block.color || [100, 130, 100];
      renderState.occluderShader.setUniform(
        "uColor",
        [color[0] / 255, color[1] / 255, color[2] / 255]
      );
      renderState.occluderShader.setUniform(
        "uAlpha",
        block.alpha ?? worldRef.resources.rendering.occluderAlpha ?? 0.35
      );
      push();
      translate(block.worldPos.x, block.worldPos.y, block.worldPos.z);
      box(
        block.collider.w * Game.config.gridSize,
        block.collider.h * Game.config.gridSize,
        block.collider.d * Game.config.gridSize
      );
      pop();
    }
    resetShader();
    blendMode(BLEND);
  }

  if (spriteDraws.length > 0) {
    const gl = drawingContext;
    if (gl && typeof gl.depthMask === "function") {
      gl.depthMask(true);
    }
    if (gl && typeof gl.enable === "function") {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.FRONT);
    }
    blendMode(REPLACE);
    spriteDraws.sort((a, b) => b.depth - a.depth);

    if (renderState?.spriteShader) {
      shader(renderState.spriteShader);
    }

    for (const draw of spriteDraws) {
      push();
      translate(draw.worldPos.x, draw.worldPos.y, draw.worldPos.z);
      rotateY(draw.billboardYaw);
      rotateX(draw.billboardPitch);
      Game.rendering.updateSpriteTexture(
        draw.spriteTex,
        draw.sprite.fps,
        draw.isMoving,
        draw.sprite.idleFrame
      );
      if (renderState?.spriteShader) {
        const outlineThickness = draw.outline?.thickness ?? 0;
        const outlineEnabled = outlineThickness > 0;
        const outlineColor = outlineEnabled
          ? draw.outline.color || [255, 200, 120]
          : [0, 0, 0];
        const texWidth =
          draw.spriteTex.texture?.width ||
          draw.spriteTex.source?.width ||
          1;
        const texHeight =
          draw.spriteTex.texture?.height ||
          draw.spriteTex.source?.height ||
          1;

        const setOutlineUniforms = (enableOutline, outlineOnly) => {
          renderState.spriteShader.setUniform("uTexture", draw.tex);
          renderState.spriteShader.setUniform(
            "uAlphaCutoff",
            draw.sprite.alphaCutoff ?? 0.4
          );
          renderState.spriteShader.setUniform(
            "uTextureSize",
            [texWidth, texHeight]
          );
          renderState.spriteShader.setUniform(
            "uEnableOutline",
            enableOutline ? 1 : 0
          );
          renderState.spriteShader.setUniform(
            "uOutlineOnly",
            outlineOnly ? 1 : 0
          );
          renderState.spriteShader.setUniform(
            "uOutlineColor",
            [
              outlineColor[0] / 255,
              outlineColor[1] / 255,
              outlineColor[2] / 255,
            ]
          );
          renderState.spriteShader.setUniform(
            "uOutlineThickness",
            outlineThickness
          );
        };

        if (outlineEnabled && draw.isPainting) {
          const expandX = (outlineThickness / texWidth) * draw.sprite.width;
          const expandY = (outlineThickness / texHeight) * draw.sprite.height;
          const outlineWidth =
            (draw.sprite.width + expandX * 2) * Game.config.gridSize;
          const outlineHeight =
            (draw.sprite.height + expandY * 2) * Game.config.gridSize;
          setOutlineUniforms(true, true);
          plane(outlineWidth, outlineHeight);
        }

        setOutlineUniforms(outlineEnabled && !draw.isPainting, false);
      } else {
        texture(draw.tex);
      }
      plane(
        draw.sprite.width * Game.config.gridSize,
        draw.sprite.height * Game.config.gridSize
      );
      pop();
    }
    if (renderState?.spriteShader) {
      resetShader();
    } else {
      Game.rendering.clearTexture();
    }
    blendMode(BLEND);
    if (gl && typeof gl.disable === "function") {
      gl.disable(gl.CULL_FACE);
    }
  }

  Game.systems.drawEditorSelection?.(worldRef);
  Game.systems.drawEditorHover?.(worldRef);

  Game.systems.drawPaintingLoadingIndicators(worldRef, cameraWorld, renderState);

  if (Game.debug?.mode === 1) {
    Game.systems.drawDebugOverlay(worldRef, cameraWorld, renderState);
  } else {
    Game.systems.drawCharacterLabels(worldRef, cameraWorld, renderState);
  }

};

Game.rendering.blockFaceDefs = [
  {
    key: "px",
    plane: { x: 1, y: 0, z: 0 },
    normal: [1, 0, 0],
    axisU: "y",
    axisV: "z",
    verts: [
      { sx: 1, sy: -1, sz: -1 },
      { sx: 1, sy: -1, sz: 1 },
      { sx: 1, sy: 1, sz: 1 },
      { sx: 1, sy: 1, sz: -1 },
    ],
  },
  {
    key: "nx",
    plane: { x: -1, y: 0, z: 0 },
    normal: [-1, 0, 0],
    axisU: "y",
    axisV: "z",
    verts: [
      { sx: -1, sy: -1, sz: 1 },
      { sx: -1, sy: -1, sz: -1 },
      { sx: -1, sy: 1, sz: -1 },
      { sx: -1, sy: 1, sz: 1 },
    ],
  },
  {
    key: "pz",
    plane: { x: 0, y: 0, z: 1 },
    normal: [0, 0, 1],
    axisU: "x",
    axisV: "y",
    verts: [
      { sx: -1, sy: -1, sz: 1 },
      { sx: 1, sy: -1, sz: 1 },
      { sx: 1, sy: 1, sz: 1 },
      { sx: -1, sy: 1, sz: 1 },
    ],
  },
  {
    key: "nz",
    plane: { x: 0, y: 0, z: -1 },
    normal: [0, 0, -1],
    axisU: "x",
    axisV: "y",
    verts: [
      { sx: 1, sy: -1, sz: -1 },
      { sx: -1, sy: -1, sz: -1 },
      { sx: -1, sy: 1, sz: -1 },
      { sx: 1, sy: 1, sz: -1 },
    ],
  },
  {
    key: "py",
    plane: { x: 0, y: 1, z: 0 },
    normal: [0, -1, 0],
    axisU: "x",
    axisV: "z",
    verts: [
      { sx: -1, sy: -1, sz: 1 },
      { sx: 1, sy: -1, sz: 1 },
      { sx: 1, sy: -1, sz: -1 },
      { sx: -1, sy: -1, sz: -1 },
    ],
  },
  {
    key: "ny",
    plane: { x: 0, y: -1, z: 0 },
    normal: [0, 1, 0],
    axisU: "x",
    axisV: "z",
    verts: [
      { sx: -1, sy: 1, sz: -1 },
      { sx: 1, sy: 1, sz: -1 },
      { sx: 1, sy: 1, sz: 1 },
      { sx: -1, sy: 1, sz: 1 },
    ],
  },
];

Game.rendering.getBlockVertexSign = function getBlockVertexSign(axis, vert) {
  if (axis === "x") {
    return vert.sx >= 0 ? 1 : -1;
  }
  if (axis === "y") {
    return vert.sy >= 0 ? -1 : 1;
  }
  return vert.sz >= 0 ? 1 : -1;
};

Game.rendering.getBlockVertexAoShade = function getBlockVertexAoShade(
  worldRef,
  cellX,
  cellY,
  cellZ,
  plane,
  axisU,
  axisV,
  signU,
  signV
) {
  const rendering = worldRef?.resources?.rendering;
  if (rendering && rendering.blockAoEnabled === false) {
    return 1;
  }
  const step = rendering?.blockAoStep ?? 0.12;
  const minShade = rendering?.blockAoMin ?? 0.55;
  const axisOffset = (axis, sign) => {
    if (axis === "x") {
      return { x: sign, y: 0, z: 0 };
    }
    if (axis === "y") {
      return { x: 0, y: sign, z: 0 };
    }
    return { x: 0, y: 0, z: sign };
  };
  const sideU = axisOffset(axisU, signU);
  const sideV = axisOffset(axisV, signV);
  const corner = {
    x: sideU.x + sideV.x,
    y: sideU.y + sideV.y,
    z: sideU.z + sideV.z,
  };
  const isSolid = (offset) =>
    Game.utils.isBlockAt(
      worldRef,
      cellX + plane.x + offset.x,
      cellY + plane.y + offset.y,
      cellZ + plane.z + offset.z
    );
  const occU = isSolid(sideU);
  const occV = isSolid(sideV);
  const occCorner = isSolid(corner);
  const count =
    occU && occV
      ? 3
      : (occU ? 1 : 0) + (occV ? 1 : 0) + (occCorner ? 1 : 0);
  const shade = 1 - count * step;
  return Math.max(minShade, shade);
};

Game.rendering.computeBlockAoCache = function computeBlockAoCache(
  worldRef,
  cellX,
  cellY,
  cellZ
) {
  const faces = Game.rendering.blockFaceDefs;
  const ao = new Float32Array(faces.length * 4);
  const rendering = worldRef?.resources?.rendering;
  if (rendering && rendering.blockAoEnabled === false) {
    ao.fill(1);
    return ao;
  }
  let index = 0;
  for (const face of faces) {
    for (const vert of face.verts) {
      const signU = Game.rendering.getBlockVertexSign(face.axisU, vert);
      const signV = Game.rendering.getBlockVertexSign(face.axisV, vert);
      ao[index] = Game.rendering.getBlockVertexAoShade(
        worldRef,
        cellX,
        cellY,
        cellZ,
        face.plane,
        face.axisU,
        face.axisV,
        signU,
        signV
      );
      index += 1;
    }
  }
  return ao;
};

Game.rendering.ensureBlockAoCache = function ensureBlockAoCache(
  worldRef,
  staticBlock,
  cellX,
  cellY,
  cellZ
) {
  if (!staticBlock) {
    return null;
  }
  const expected = Game.rendering.blockFaceDefs.length * 4;
  if (
    !staticBlock.ao ||
    staticBlock.ao.length !== expected ||
    staticBlock.aoDirty
  ) {
    staticBlock.ao = Game.rendering.computeBlockAoCache(
      worldRef,
      cellX,
      cellY,
      cellZ
    );
    staticBlock.aoDirty = false;
  }
  return staticBlock.ao;
};

Game.rendering.markBlockAoDirtyAt = function markBlockAoDirtyAt(
  worldRef,
  cellX,
  cellY,
  cellZ
) {
  const key = Game.utils.blockKey(cellX, cellY, cellZ);
  const entity = worldRef?.resources?.blockIndex?.get(key);
  if (!entity) {
    return;
  }
  const block = worldRef.components?.StaticBlock?.get(entity);
  if (!block) {
    return;
  }
  block.aoDirty = true;
  worldRef.components.StaticBlock.set(entity, block);
};

Game.rendering.markBlockAoDirtyAround = function markBlockAoDirtyAround(
  worldRef,
  cellX,
  cellY,
  cellZ
) {
  if (!worldRef?.resources?.blockIndex) {
    return;
  }
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        Game.rendering.markBlockAoDirtyAt(
          worldRef,
          cellX + dx,
          cellY + dy,
          cellZ + dz
        );
      }
    }
  }
};

Game.rendering.rebuildBlockAoCache = function rebuildBlockAoCache(worldRef) {
  if (!worldRef?.components?.StaticBlock) {
    return;
  }
  for (const [entity, block] of worldRef.components.StaticBlock.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    if (!transform?.pos) {
      continue;
    }
    const cellX = Math.floor(transform.pos.x);
    const cellY = Math.floor(transform.pos.y);
    const cellZ = Math.floor(transform.pos.z);
    block.ao = Game.rendering.computeBlockAoCache(
      worldRef,
      cellX,
      cellY,
      cellZ
    );
    block.aoDirty = false;
    worldRef.components.StaticBlock.set(entity, block);
  }
};

Game.rendering.drawBlockWithVertexAO = function drawBlockWithVertexAO(
  worldRef,
  transform,
  collider,
  renderable,
  staticBlock,
  cellX,
  cellY,
  cellZ
) {
  if (!transform || !collider || !renderable) {
    return;
  }
  const grid = Game.config.gridSize;
  const sizeX = collider.w * grid;
  const sizeY = collider.h * grid;
  const sizeZ = collider.d * grid;
  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const halfZ = sizeZ / 2;
  const center = {
    x: transform.pos.x,
    y: transform.pos.y + collider.h / 2,
    z: transform.pos.z,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const blockX = Number.isFinite(cellX) ? cellX : Math.floor(transform.pos.x);
  const blockY = Number.isFinite(cellY) ? cellY : Math.floor(transform.pos.y);
  const blockZ = Number.isFinite(cellZ) ? cellZ : Math.floor(transform.pos.z);
  const base = renderable.color || [110, 145, 110];
  const isBlock = (dx, dy, dz) =>
    Game.utils.isBlockAt(worldRef, blockX + dx, blockY + dy, blockZ + dz);
  const faces = Game.rendering.blockFaceDefs;
  const cachedAo = Game.rendering.ensureBlockAoCache(
    worldRef,
    staticBlock,
    blockX,
    blockY,
    blockZ
  );

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noStroke();
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex];
    if (isBlock(face.plane.x, face.plane.y, face.plane.z)) {
      continue;
    }
    beginShape(QUADS);
    normal(face.normal[0], face.normal[1], face.normal[2]);
    for (let vertIndex = 0; vertIndex < face.verts.length; vertIndex += 1) {
      const vert = face.verts[vertIndex];
      const shade = cachedAo
        ? cachedAo[faceIndex * 4 + vertIndex]
        : Game.rendering.getBlockVertexAoShade(
            worldRef,
            blockX,
            blockY,
            blockZ,
            face.plane,
            face.axisU,
            face.axisV,
            Game.rendering.getBlockVertexSign(face.axisU, vert),
            Game.rendering.getBlockVertexSign(face.axisV, vert)
          );
      fill(base[0] * shade, base[1] * shade, base[2] * shade);
      vertex(vert.sx * halfX, vert.sy * halfY, vert.sz * halfZ);
    }
    endShape();
  }
  pop();
};

Game.systems.drawPaintingLoadingIndicators =
  function drawPaintingLoadingIndicators(worldRef, cameraWorld, renderState) {
    if (!worldRef) {
      return;
    }
    const streaming = worldRef.resources.paintingStreaming;
    const loading = streaming?.loading;
    if (!loading || loading.size === 0) {
      return;
    }
    const playerId = worldRef.resources.playerId;
    const playerTransform = playerId
      ? worldRef.components.Transform.get(playerId)
      : null;
    if (!playerTransform) {
      return;
    }
    const defaultRadius =
      streaming.indicatorRadius ?? streaming.loadRadius ?? 6;

    resetShader();
    blendMode(BLEND);
    noLights();
    Game.rendering.clearTexture();
    if (renderState?.uiFont) {
      textFont(renderState.uiFont);
    }
    textSize(12);
    textAlign(CENTER, CENTER);

    for (const [entity, painting] of worldRef.components.Painting.entries()) {
      const textureKey = painting?.textureKey || painting?.id;
      if (!textureKey || !loading.has(textureKey)) {
        continue;
      }
      const transform = worldRef.components.Transform.get(entity);
      const collider = worldRef.components.Collider.get(entity);
      const sprite = worldRef.components.BillboardSprite.get(entity);
      if (!transform || !collider || !sprite) {
        continue;
      }
      const radius = painting.indicatorRadius ?? defaultRadius;
      const dx = transform.pos.x - playerTransform.pos.x;
      const dy = transform.pos.y - playerTransform.pos.y;
      const dz = transform.pos.z - playerTransform.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius) {
        continue;
      }

      const labelData = worldRef.components.Label.get(entity);
      let color = [255, 120, 200];
      if (
        labelData &&
        Array.isArray(labelData.color) &&
        labelData.color.length >= 3
      ) {
        color = labelData.color;
      }

      const center = {
        x: transform.pos.x,
        y: transform.pos.y + (sprite.offsetY ?? collider.h / 2),
        z: transform.pos.z,
      };
      const worldPos = Game.utils.gameToWorld(center);
      let yaw = transform.rotY;
      let pitch = sprite.pitch ?? 0;
      if (sprite.billboard !== false) {
        const toCamWorld = {
          x: cameraWorld.x - worldPos.x,
          y: cameraWorld.y - worldPos.y,
          z: cameraWorld.z - worldPos.z,
        };
        const horiz = Math.hypot(toCamWorld.x, toCamWorld.z);
        yaw = Math.atan2(toCamWorld.x, toCamWorld.z);
        pitch = Math.atan2(toCamWorld.y, horiz || 1);
      }

      const width = sprite.width ?? collider.w;
      const height = sprite.height ?? collider.h;
      const depth = 0.04;

      push();
      translate(worldPos.x, worldPos.y, worldPos.z);
      rotateY(yaw);
      rotateX(pitch);
      noFill();
      stroke(color[0], color[1], color[2]);
      strokeWeight(2);
      box(
        width * Game.config.gridSize,
        height * Game.config.gridSize,
        depth * Game.config.gridSize
      );
      translate(0, 0, depth * Game.config.gridSize * 0.6);
      noStroke();
      fill(color[0], color[1], color[2]);
      text("Loading", 0, 0);
      pop();
    }
  };

Game.systems.drawCharacterLabels = function drawCharacterLabels(
  worldRef,
  cameraWorld,
  renderState
) {
  if (!worldRef || !renderState?.uiFont) {
    return;
  }

  resetShader();
  blendMode(BLEND);
  noLights();
  Game.rendering.clearTexture();

  textFont(renderState.uiFont);
  textSize(12);
  textAlign(CENTER, BOTTOM);

  for (const [entity, labelData] of worldRef.components.Label.entries()) {
    if (!labelData || labelData.showInGame === false) {
      continue;
    }

    const isRemote = worldRef.components.RemotePlayer.has(entity);
    const isPlayer = worldRef.components.Player.has(entity) || isRemote;
    const isNPC = worldRef.components.NPC.has(entity);
    if (!isPlayer && !isNPC) {
      continue;
    }

    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }

    let color = isNPC ? [120, 200, 255] : [255, 220, 80];
    if (Array.isArray(labelData.color) && labelData.color.length >= 3) {
      color = labelData.color;
    }

    const labelText = labelData.text ?? `entity:${entity}`;
    const labelOffset = labelData.offsetY ?? 0.1;
    const labelPos = {
      x: transform.pos.x,
      y: transform.pos.y + collider.h + labelOffset,
      z: transform.pos.z,
    };
    const labelWorld = Game.utils.gameToWorld(labelPos);
    const toCam = {
      x: cameraWorld.x - labelWorld.x,
      z: cameraWorld.z - labelWorld.z,
    };
    const yaw = Math.atan2(toCam.x, toCam.z);

    push();
    translate(labelWorld.x, labelWorld.y, labelWorld.z);
    rotateY(yaw);
    noStroke();
    fill(color[0], color[1], color[2]);
    text(labelText, 0, 0);
    pop();
  }
};

Game.systems.drawDebugOverlay = function drawDebugOverlay(
  worldRef,
  cameraWorld,
  renderState
) {
  if (!worldRef) {
    return;
  }

  resetShader();
  blendMode(BLEND);
  noLights();
  Game.rendering.clearTexture();

  if (renderState?.uiFont) {
    textFont(renderState.uiFont);
  }
  textSize(12);
  textAlign(CENTER, BOTTOM);

  for (const [entity, collider] of worldRef.components.Collider.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    if (!transform) {
      continue;
    }

    const labelData = worldRef.components.Label.get(entity);
    if (!labelData) {
      continue;
    }

    const isRemote = worldRef.components.RemotePlayer.has(entity);
    const isPlayer = worldRef.components.Player.has(entity) || isRemote;
    const isNPC = worldRef.components.NPC.has(entity);
    const isPainting = worldRef.components.Painting.has(entity);

    let color = [255, 220, 80];
    if (isNPC) {
      color = [120, 200, 255];
    } else if (isPainting) {
      color = [255, 120, 200];
    }
    if (Array.isArray(labelData.color) && labelData.color.length >= 3) {
      color = labelData.color;
    }

    const label = labelData.text ?? `entity:${entity}`;

    const pos = transform.pos;
    const displayPos = isPainting
      ? {
          x: pos.x - collider.w / 2,
          y: pos.y,
          z: pos.z - collider.d / 2,
        }
      : pos;
    const posText = `${displayPos.x.toFixed(2)}, ${displayPos.y.toFixed(
      2
    )}, ${displayPos.z.toFixed(2)}`;

    const center = { x: pos.x, y: pos.y + collider.h / 2, z: pos.z };
    const worldPos = Game.utils.gameToWorld(center);

    push();
    translate(worldPos.x, worldPos.y, worldPos.z);
    stroke(color[0], color[1], color[2]);
    strokeWeight(2);
    noFill();
    box(
      collider.w * Game.config.gridSize,
      collider.h * Game.config.gridSize,
      collider.d * Game.config.gridSize
    );
    pop();

    const labelOffset = labelData.offsetY ?? 0.1;
    const labelPos = {
      x: pos.x,
      y: pos.y + collider.h + labelOffset,
      z: pos.z,
    };
    const labelWorld = Game.utils.gameToWorld(labelPos);
    const toCam = {
      x: cameraWorld.x - labelWorld.x,
      z: cameraWorld.z - labelWorld.z,
    };
    const yaw = Math.atan2(toCam.x, toCam.z);

    push();
    translate(labelWorld.x, labelWorld.y, labelWorld.z);
    rotateY(yaw);
    noStroke();
    fill(color[0], color[1], color[2]);
    text(`${label} (${posText})`, 0, 0);
    pop();
  }
};
