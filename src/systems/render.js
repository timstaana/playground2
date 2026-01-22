window.Game = window.Game || {};
Game.systems = Game.systems || {};

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
        spriteDraws.push({
          sprite,
          spriteTex,
          tex,
          worldPos,
          billboardYaw,
          billboardPitch,
          isMoving: shouldAnimate,
          depth,
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

    if (worldRef.components.StaticBlock.has(entity)) {
      const cellX = Math.floor(transform.pos.x);
      const cellY = Math.floor(transform.pos.y);
      const cellZ = Math.floor(transform.pos.z);
      const occluderAlpha = occluderMap.get(Game.utils.blockKey(cellX, cellY, cellZ));
      if (occluderAlpha !== undefined) {
        occluderBlocks.push({
          worldPos,
          collider,
          color: renderable.color,
          alpha: occluderAlpha,
        });
        continue;
      }
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
        renderState.spriteShader.setUniform("uTexture", draw.tex);
        renderState.spriteShader.setUniform(
          "uAlphaCutoff",
          draw.sprite.alphaCutoff ?? 0.4
        );
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
  }

  if (Game.debug?.enabled) {
    Game.systems.drawDebugOverlay(worldRef, cameraWorld, renderState);
  } else {
    Game.systems.drawCharacterLabels(worldRef, cameraWorld, renderState);
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

    const isPlayer = worldRef.components.Player.has(entity);
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

    const isPlayer = worldRef.components.Player.has(entity);
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
