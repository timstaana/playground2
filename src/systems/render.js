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
      const toCamWorld = {
        x: cameraWorld.x - worldPos.x,
        y: cameraWorld.y - worldPos.y,
        z: cameraWorld.z - worldPos.z,
      };
      const horiz = Math.hypot(toCamWorld.x, toCamWorld.z);
      const billboardYaw = Math.atan2(toCamWorld.x, toCamWorld.z);
      const billboardPitch = Math.atan2(toCamWorld.y, horiz || 1);
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
          isMoving,
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
};
