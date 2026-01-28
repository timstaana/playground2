window.Game = window.Game || {};
Game.systems = Game.systems || {};
Game.rendering = Game.rendering || {};

Game.rendering.blockChunkKey = function blockChunkKey(cx, cy, cz) {
  return `${cx}|${cy}|${cz}`;
};

Game.rendering.getChunkCoordsForCell = function getChunkCoordsForCell(
  x,
  y,
  z,
  chunkSize
) {
  const size = typeof chunkSize === "number" && chunkSize > 0 ? chunkSize : 16;
  return {
    cx: Math.floor(x / size),
    cy: Math.floor(y / size),
    cz: Math.floor(z / size),
  };
};

Game.rendering.ensureBlockChunk = function ensureBlockChunk(
  worldRef,
  cx,
  cy,
  cz,
  chunkSize
) {
  if (!worldRef?.resources?.rendering) {
    return null;
  }
  const rendering = worldRef.resources.rendering;
  if (!rendering.blockChunks) {
    rendering.blockChunks = new Map();
  }
  const key = Game.rendering.blockChunkKey(cx, cy, cz);
  let chunk = rendering.blockChunks.get(key);
  if (!chunk) {
    const size = typeof chunkSize === "number" && chunkSize > 0 ? chunkSize : 16;
    const half = (size - 1) / 2;
    chunk = {
      key,
      cx,
      cy,
      cz,
      center: {
        x: cx * size + half + 0.5,
        y: cy * size + half + 0.5,
        z: cz * size + half + 0.5,
      },
      radius: Math.sqrt(3) * half,
      dirty: true,
      blockCount: 0,
      faceCount: 0,
      shapes: null,
    };
    rendering.blockChunks.set(key, chunk);
  }
  return chunk;
};

Game.rendering.markBlockChunkDirtyAround =
  function markBlockChunkDirtyAround(worldRef, x, y, z) {
    if (!worldRef?.resources?.rendering) {
      return;
    }
    const rendering = worldRef.resources.rendering;
    const chunkSize = rendering.blockChunkSize ?? 16;
    const offsets = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];
    for (const [ox, oy, oz] of offsets) {
      const cx = x + ox;
      const cy = y + oy;
      const cz = z + oz;
      const coords = Game.rendering.getChunkCoordsForCell(
        cx,
        cy,
        cz,
        chunkSize
      );
      const chunk = Game.rendering.ensureBlockChunk(
        worldRef,
        coords.cx,
        coords.cy,
        coords.cz,
        chunkSize
      );
      if (chunk) {
        chunk.dirty = true;
      }
    }
  };

Game.rendering.rebuildAllBlockChunks =
  function rebuildAllBlockChunks(worldRef) {
    if (!worldRef?.resources?.rendering) {
      return;
    }
    const rendering = worldRef.resources.rendering;
    const chunkSize = rendering.blockChunkSize ?? 16;
    rendering.blockChunks = new Map();
    if (!worldRef.resources?.blockSet) {
      return;
    }
    for (const key of worldRef.resources.blockSet.values()) {
      const parts = key.split("|");
      if (parts.length < 3) {
        continue;
      }
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      const z = Number(parts[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        continue;
      }
      const coords = Game.rendering.getChunkCoordsForCell(x, y, z, chunkSize);
      Game.rendering.ensureBlockChunk(
        worldRef,
        coords.cx,
        coords.cy,
        coords.cz,
        chunkSize
      );
    }
    for (const chunk of rendering.blockChunks.values()) {
      Game.rendering.rebuildBlockChunk(worldRef, chunk, chunkSize);
    }
  };

Game.rendering.rebuildBlockChunk = function rebuildBlockChunk(
  worldRef,
  chunk,
  chunkSize
) {
  if (!worldRef || !chunk) {
    return false;
  }
  const size = typeof chunkSize === "number" && chunkSize > 0 ? chunkSize : 16;
  const minX = chunk.cx * size;
  const minY = chunk.cy * size;
  const minZ = chunk.cz * size;
  const maxX = minX + size - 1;
  const maxY = minY + size - 1;
  const maxZ = minZ + size - 1;
  const grid = Game.config.gridSize;
  const rendering = worldRef.resources?.rendering || {};
  const blockIndex = worldRef.resources?.blockIndex || null;
  const shapes = new Map();
  let blockCount = 0;
  let faceCount = 0;
  const aoStrengthRaw =
    typeof rendering.blockAoStrength === "number"
      ? rendering.blockAoStrength
      : 0;
  const aoStrength = Math.max(0, Math.min(aoStrengthRaw, 0.45));
  const aoMin =
    typeof rendering.blockAoMin === "number" ? rendering.blockAoMin : 0.3;
  const aoEnabled = aoStrength > 0;
  const canBuildGeometry =
    typeof buildGeometry === "function" && typeof model === "function";

  const faceRampShade = (normal) => {
    if (!aoEnabled) {
      return 1;
    }
    let ramp = 0.85;
    if (normal[1] > 0.5) {
      ramp = 1;
    } else if (normal[1] < -0.5) {
      ramp = 0.6;
    }
    const shade = 1 - aoStrength * (1 - ramp);
    return Math.max(aoMin, shade);
  };

  const ensureEntry = (color) => {
    const key = `${color[0]},${color[1]},${color[2]}`;
    let entry = shapes.get(key);
    if (!entry) {
      entry = {
        mode: "data",
        color,
        verts: [],
        normals: [],
        colors: null,
      };
      shapes.set(key, entry);
    }
    return entry;
  };

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!Game.utils.isBlockAt(worldRef, x, y, z)) {
          continue;
        }
        blockCount += 1;
        const key = Game.utils.blockKey(x, y, z);
        const entity = blockIndex ? blockIndex.get(key) : null;
        const renderable = entity
          ? worldRef.components.Renderable.get(entity)
          : null;
        const collider = entity
          ? worldRef.components.Collider.get(entity)
          : null;
        const baseColor = renderable?.color || [110, 145, 110];

        const halfX = (collider?.w ?? 1) * grid * 0.5;
        const halfY = (collider?.h ?? 1) * grid * 0.5;
        const halfZ = (collider?.d ?? 1) * grid * 0.5;
        const centerWorld = {
          x: (x + 0.5) * grid,
          y: -(y + 0.5) * grid,
          z: (z + 0.5) * grid,
        };

        for (const face of Game.rendering.blockFaceDefs) {
          if (
            Game.utils.isBlockAt(
              worldRef,
              x + face.plane.x,
              y + face.plane.y,
              z + face.plane.z
            )
          ) {
            continue;
          }
          const shade = faceRampShade(face.normal);
          const faceColor = aoEnabled
            ? [
                Math.round(baseColor[0] * shade),
                Math.round(baseColor[1] * shade),
                Math.round(baseColor[2] * shade),
              ]
            : baseColor;
          const entry = ensureEntry(faceColor);
          for (const vert of face.verts) {
            entry.normals.push(face.normal[0], face.normal[1], face.normal[2]);
            entry.verts.push(
              centerWorld.x + vert.sx * halfX,
              centerWorld.y + vert.sy * halfY,
              centerWorld.z + vert.sz * halfZ
            );
          }
          faceCount += 1;
        }
      }
    }
  }

  for (const entry of shapes.values()) {
    if (canBuildGeometry) {
      const verts = entry.verts;
      const normals = entry.normals;
      entry.mode = "geometry";
      entry.geom = buildGeometry(() => {
        beginShape(QUADS);
        for (let i = 0; i < verts.length; i += 3) {
          normal(normals[i], normals[i + 1], normals[i + 2]);
          vertex(verts[i], verts[i + 1], verts[i + 2]);
        }
        endShape();
      });
      entry.verts = null;
      entry.normals = null;
    }
  }

  chunk.shapes = shapes.size > 0 ? shapes : null;
  chunk.blockCount = blockCount;
  chunk.faceCount = faceCount;
  chunk.dirty = false;
  return blockCount > 0;
};

Game.rendering.isChunkVisible = function isChunkVisible(
  chunk,
  cullPos,
  viewDir,
  cullDistance,
  cullCos,
  cullAngle
) {
  if (!chunk?.center || !cullPos || !viewDir) {
    return true;
  }
  const dx = chunk.center.x - cullPos.x;
  const dy = chunk.center.y - cullPos.y;
  const dz = chunk.center.z - cullPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const radius = chunk.radius ?? 0;
  if (cullDistance > 0) {
    const maxDist = cullDistance + radius;
    if (distSq > maxDist * maxDist) {
      return false;
    }
  }
  if (cullCos === null || cullCos === undefined) {
    return true;
  }
  const dist = Math.sqrt(distSq);
  if (dist <= 1e-6 || dist <= radius) {
    return true;
  }
  const dot = (dx * viewDir.x + dy * viewDir.y + dz * viewDir.z) / dist;
  if (!Number.isFinite(cullAngle)) {
    return dot >= cullCos;
  }
  if (radius <= 1e-6) {
    return dot >= cullCos;
  }
  const margin = Math.asin(Math.min(1, radius / dist));
  const maxAngle = cullAngle + margin;
  return dot >= Math.cos(maxAngle);
};

Game.systems.renderSystem = function renderSystem(worldRef, renderState) {
  noLights();

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
  const cameraState = worldRef.resources.cameraState;
  if (cameraState?.pos && cameraState?.lookAt) {
    const dir = {
      x: cameraState.lookAt.x - cameraState.pos.x,
      y: cameraState.lookAt.y - cameraState.pos.y,
      z: cameraState.lookAt.z - cameraState.pos.z,
    };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len > 1e-6) {
      viewDir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    }
  }
  const rendering = worldRef.resources.rendering;
  const cullDistance = rendering?.blockCullDistance ?? 0;
  const cullPadding = rendering?.blockCullFovPadding ?? 0;
  const chunkSize = rendering?.blockChunkSize ?? 0;
  const cullPos = cameraState?.pos || cameraPos;
  let cullCos = null;
  let cullAngle = null;
  if (cullDistance > 0) {
    const vFov = cameraState?.fov ?? Math.PI / 3;
    const aspect =
      cameraState?.aspect ||
      (typeof width === "number" && typeof height === "number" && height > 0
        ? width / height
        : 1);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const maxHalfFov = Math.max(vFov, hFov) * 0.5 + cullPadding;
    cullCos = Math.cos(maxHalfFov);
    const clamped = Math.max(-1, Math.min(1, cullCos));
    cullAngle = Math.acos(clamped);
  }
  const spriteDraws = [];

  if (chunkSize > 0) {
    if (!rendering.blockChunks) {
      Game.rendering.rebuildAllBlockChunks(worldRef);
    }
    const removeKeys = [];
    for (const [key, chunk] of rendering.blockChunks || []) {
      if (chunk?.dirty) {
        const hasBlocks = Game.rendering.rebuildBlockChunk(
          worldRef,
          chunk,
          chunkSize
        );
        if (!hasBlocks) {
          removeKeys.push(key);
          continue;
        }
      }
      if (!chunk?.shapes || chunk.faceCount <= 0) {
        continue;
      }
      if (
        !Game.rendering.isChunkVisible(
          chunk,
          cullPos,
          viewDir,
          cullDistance,
          cullCos,
          cullAngle
        )
      ) {
        continue;
      }
      for (const entry of chunk.shapes.values()) {
        const color = entry.color || [110, 145, 110];
        fill(color[0], color[1], color[2]);
        if (
          entry.mode === "geometry" &&
          entry.geom &&
          typeof model === "function"
        ) {
          model(entry.geom);
        } else if (entry.verts && entry.normals) {
          beginShape(QUADS);
          for (let i = 0; i < entry.verts.length; i += 3) {
            normal(
              entry.normals[i],
              entry.normals[i + 1],
              entry.normals[i + 2]
            );
            vertex(
              entry.verts[i],
              entry.verts[i + 1],
              entry.verts[i + 2]
            );
          }
          endShape();
        }
      }
    }
    for (const key of removeKeys) {
      rendering.blockChunks.delete(key);
    }
  }

  for (const [entity, renderable] of worldRef.components.Renderable.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!transform || !collider) {
      continue;
    }
    if (worldRef.components.StaticBlock.has(entity)) {
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
        Game.systems.drawPaintingPlaceholder?.(worldRef, {
          entity,
          transform,
          collider,
          sprite,
          renderable,
          worldPos,
          billboardYaw,
          billboardPitch,
        });
        continue;
      }
    }

    const center = {
      x: transform.pos.x,
      y: transform.pos.y + collider.h / 2,
      z: transform.pos.z,
    };
    const worldPos = Game.utils.gameToWorld(center);

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

  if (Game.debug?.mode > 0) {
    Game.systems.drawEditorSelection?.(worldRef);
    Game.systems.drawEditorHover?.(worldRef);
  }

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

Game.rendering.drawBlockFaces = function drawBlockFaces(
  worldRef,
  transform,
  collider,
  renderable,
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

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noStroke();
  for (const face of faces) {
    if (isBlock(face.plane.x, face.plane.y, face.plane.z)) {
      continue;
    }
    beginShape(QUADS);
    normal(face.normal[0], face.normal[1], face.normal[2]);
    fill(base[0], base[1], base[2]);
    for (const vert of face.verts) {
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

Game.systems.drawPaintingPlaceholder = function drawPaintingPlaceholder(
  worldRef,
  info
) {
  if (!worldRef || !info) {
    return;
  }
  const transform = info.transform;
  const collider = info.collider;
  const sprite = info.sprite;
  if (!transform || !collider || !sprite) {
    return;
  }
  const worldPos = info.worldPos;
  const yaw = info.billboardYaw ?? transform.rotY ?? 0;
  const pitch = info.billboardPitch ?? 0;
  const label = worldRef.components.Label.get(info.entity);
  const baseColor = Array.isArray(info.renderable?.color)
    ? info.renderable.color
    : [220, 220, 220];
  const accentColor =
    label && Array.isArray(label.color) ? label.color : [120, 120, 120];
  const fillColor = [
    Math.min(255, baseColor[0] * 0.85 + 30),
    Math.min(255, baseColor[1] * 0.85 + 30),
    Math.min(255, baseColor[2] * 0.85 + 30),
  ];
  const grid = Game.config.gridSize;
  const width = (sprite.width ?? collider.w) * grid;
  const height = (sprite.height ?? collider.h) * grid;
  const depth = (sprite.placeholderDepth ?? 0.04) * grid;

  Game.rendering.clearTexture();
  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  rotateY(yaw);
  rotateX(pitch);

  noStroke();
  fill(fillColor[0], fillColor[1], fillColor[2]);
  box(width, height, depth);

  stroke(accentColor[0], accentColor[1], accentColor[2]);
  strokeWeight(1.5);
  noFill();
  box(width * 1.01, height * 1.01, depth * 1.05);

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const z = depth * 0.6;
  line(-halfW, -halfH, z, halfW, halfH, z);
  line(-halfW, halfH, z, halfW, -halfH, z);
  pop();
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
