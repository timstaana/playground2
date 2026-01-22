window.Game = window.Game || {};
Game.level = Game.level || {};

Game.level.buildLevel = function buildLevel(worldRef, level) {
  Game.config.gridSize = level.gridSize || Game.config.gridSize;

  const gravityValue = level.gravity ?? 18;
  const playerDef = level.player || {};
  const playerSpriteDef = playerDef.sprite || {};
  const renderingDef = level.rendering || {};
  const playerSize = playerDef.size || { w: 1, d: 1, h: 1.5 };
  const playerSpeed = playerDef.speed ?? 4;
  const playerTurnSpeed = playerDef.turnSpeed ?? 2.6;
  const jumpHeight = playerDef.jumpHeight ?? 1.5;
  const spawn = playerDef.spawn || { x: 2.5, y: 1, z: 2.5 };

  worldRef.resources.rendering.occluderAlpha =
    renderingDef.occluderAlpha ?? worldRef.resources.rendering.occluderAlpha;
  worldRef.resources.rendering.occluderDitherScale =
    renderingDef.occluderDitherScale ??
    worldRef.resources.rendering.occluderDitherScale;
  worldRef.resources.rendering.occluderConeRadius =
    renderingDef.occluderConeRadius ??
    worldRef.resources.rendering.occluderConeRadius;
  worldRef.resources.rendering.occluderConeHeight =
    renderingDef.occluderConeHeight ??
    worldRef.resources.rendering.occluderConeHeight;
  worldRef.resources.rendering.occluderConeSamples =
    renderingDef.occluderConeSamples ??
    worldRef.resources.rendering.occluderConeSamples;
  worldRef.resources.rendering.occluderConeRings =
    renderingDef.occluderConeRings ?? worldRef.resources.rendering.occluderConeRings;
  worldRef.resources.rendering.occluderConeHeights =
    renderingDef.occluderConeHeights ??
    worldRef.resources.rendering.occluderConeHeights;
  worldRef.resources.rendering.occluderFadeDistance =
    renderingDef.occluderFadeDistance ??
    worldRef.resources.rendering.occluderFadeDistance;
  worldRef.resources.rendering.occluderAmbient =
    renderingDef.occluderAmbient ?? worldRef.resources.rendering.occluderAmbient;

  const blocks = level.blocks || [];
  for (const block of blocks) {
    const blockEntity = Game.ecs.createEntity(worldRef);
    Game.ecs.addComponent(worldRef, "Transform", blockEntity, {
      pos: { x: block.x + 0.5, y: block.y, z: block.z + 0.5 },
      rotY: 0,
    });
    Game.ecs.addComponent(worldRef, "Collider", blockEntity, { w: 1, d: 1, h: 1 });
    Game.ecs.addComponent(worldRef, "Renderable", blockEntity, {
      color: block.color || [110, 145, 110],
      kind: "block",
    });
    Game.ecs.addComponent(worldRef, "StaticBlock", blockEntity, {});
    worldRef.resources.blockSet.add(Game.utils.blockKey(block.x, block.y, block.z));
  }

  const player = Game.ecs.createEntity(worldRef);
  Game.ecs.addComponent(worldRef, "Transform", player, {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    rotY: 0,
  });
  Game.ecs.addComponent(worldRef, "Velocity", player, { x: 0, y: 0, z: 0 });
  Game.ecs.addComponent(worldRef, "MoveIntent", player, {
    throttle: 0,
    turn: 0,
    jumpRequested: false,
    grounded: false,
  });
  Game.ecs.addComponent(worldRef, "Gravity", player, { value: gravityValue });
  Game.ecs.addComponent(worldRef, "Collider", player, {
    w: playerSize.w,
    d: playerSize.d,
    h: playerSize.h,
  });
  Game.ecs.addComponent(worldRef, "Renderable", player, {
    color: [210, 90, 70],
    kind: "player",
  });
  Game.ecs.addComponent(worldRef, "BillboardSprite", player, {
    front: playerSpriteDef.frontKey || "playerFront",
    back: playerSpriteDef.backKey || "playerBack",
    width: playerSpriteDef.width ?? playerSize.w,
    height: playerSpriteDef.height ?? playerSize.h,
    offsetY:
      playerSpriteDef.offsetY ?? (playerSpriteDef.height ?? playerSize.h) / 2,
    fps: playerSpriteDef.fps ?? 12,
    idleFrame: playerSpriteDef.idleFrame ?? 0,
    alphaCutoff: playerSpriteDef.alphaCutoff ?? 0.4,
  });
  Game.ecs.addComponent(worldRef, "Speed", player, { value: playerSpeed });
  Game.ecs.addComponent(worldRef, "TurnSpeed", player, { value: playerTurnSpeed });
  Game.ecs.addComponent(worldRef, "Jump", player, {
    velocity: Math.sqrt(2 * gravityValue * jumpHeight),
  });
  Game.ecs.addComponent(worldRef, "Player", player, {});
  Game.ecs.addComponent(worldRef, "Label", player, {
    text: playerDef.label ?? "player",
    color: playerDef.labelColor || null,
    offsetY: playerDef.labelOffsetY ?? 0.1,
  });
  worldRef.resources.playerId = player;

  const npcDefs = level.npcs || [];
  const defaultFrontKey = playerSpriteDef.frontKey || "playerFront";
  const defaultBackKey = playerSpriteDef.backKey || "playerBack";
  const defaultSpriteWidth = playerSpriteDef.width ?? playerSize.w;
  const defaultSpriteHeight = playerSpriteDef.height ?? playerSize.h;
  const defaultSpriteOffsetY =
    playerSpriteDef.offsetY ?? defaultSpriteHeight / 2;

  for (let i = 0; i < npcDefs.length; i += 1) {
    const npcDef = npcDefs[i];
    const npc = Game.ecs.createEntity(worldRef);
    const npcSpawn = npcDef.spawn || { x: 1.5, y: 1, z: 1.5 };
    const npcSize = npcDef.size || playerSize;
    const npcSprite = npcDef.sprite || {};

    Game.ecs.addComponent(worldRef, "Transform", npc, {
      pos: { x: npcSpawn.x, y: npcSpawn.y, z: npcSpawn.z },
      rotY: npcDef.yaw ?? 0,
    });
    Game.ecs.addComponent(worldRef, "Collider", npc, {
      w: npcSize.w,
      d: npcSize.d,
      h: npcSize.h,
    });
    Game.ecs.addComponent(worldRef, "Renderable", npc, {
      color: npcDef.color || [70, 110, 200],
      kind: "npc",
    });
    const spriteWidth = npcSprite.width ?? defaultSpriteWidth;
    const spriteHeight = npcSprite.height ?? defaultSpriteHeight;
    const spriteOffsetY =
      npcSprite.offsetY ?? (npcSprite.height ?? defaultSpriteHeight) / 2;

    Game.ecs.addComponent(worldRef, "BillboardSprite", npc, {
      front: npcSprite.frontKey || defaultFrontKey,
      back: npcSprite.backKey || defaultBackKey,
      width: spriteWidth,
      height: spriteHeight,
      offsetY: spriteOffsetY,
      fps: npcSprite.fps ?? playerSpriteDef.fps ?? 12,
      idleFrame: npcSprite.idleFrame ?? playerSpriteDef.idleFrame ?? 0,
      alphaCutoff:
        npcSprite.alphaCutoff ?? playerSpriteDef.alphaCutoff ?? 0.4,
    });
    Game.ecs.addComponent(worldRef, "NPC", npc, {
      id: npcDef.id || `npc-${i + 1}`,
    });
    Game.ecs.addComponent(worldRef, "Label", npc, {
      text:
        npcDef.label ??
        npcDef.name ??
        npcDef.id ??
        `npc-${i + 1}`,
      color: npcDef.labelColor || null,
      offsetY: npcDef.labelOffsetY ?? 0.1,
    });
  }

  const paintingDefs = level.paintings || [];
  for (let i = 0; i < paintingDefs.length; i += 1) {
    const paintingDef = paintingDefs[i] || {};
    const painting = Game.ecs.createEntity(worldRef);
    const anchorPos = paintingDef.pos || paintingDef.spawn || {
      x: 1.5,
      y: 1,
      z: 1.5,
    };
    const size = paintingDef.size || {};
    const width = paintingDef.width ?? size.w ?? 1;
    const height = paintingDef.height ?? size.h ?? 1;
    const depth = paintingDef.depth ?? size.d ?? 1;
    const textureKey =
      paintingDef.textureKey || paintingDef.key || paintingDef.id || `painting-${i + 1}`;
    const frontKey = paintingDef.frontKey || textureKey;
    const backKey = paintingDef.backKey || textureKey;
    const texRef =
      worldRef.resources.textures[frontKey] ||
      worldRef.resources.textures[backKey];
    const texSource = texRef?.source || texRef?.texture;
    const aspect =
      texSource && texSource.width && texSource.height
        ? texSource.width / texSource.height
        : null;
    let fittedWidth = width;
    let fittedHeight = height;
    if (aspect && width > 0 && height > 0) {
      const boundRatio = width / height;
      if (aspect >= boundRatio) {
        fittedWidth = width;
        fittedHeight = width / aspect;
      } else {
        fittedHeight = height;
        fittedWidth = height * aspect;
      }
    } else if (aspect && width > 0) {
      fittedWidth = width;
      fittedHeight = width / aspect;
    } else if (aspect && height > 0) {
      fittedHeight = height;
      fittedWidth = height * aspect;
    }

    const bottomCenter = {
      x: anchorPos.x + width / 2,
      y: anchorPos.y - height,
      z: anchorPos.z,
    };

    Game.ecs.addComponent(worldRef, "Transform", painting, {
      pos: { x: bottomCenter.x, y: bottomCenter.y, z: bottomCenter.z },
      rotY: paintingDef.yaw ?? 0,
    });
    Game.ecs.addComponent(worldRef, "Collider", painting, {
      w: width,
      d: depth,
      h: height,
    });
    Game.ecs.addComponent(worldRef, "Renderable", painting, {
      color: paintingDef.color || [255, 255, 255],
      kind: "painting",
    });
    Game.ecs.addComponent(worldRef, "BillboardSprite", painting, {
      front: frontKey,
      back: backKey,
      width: fittedWidth,
      height: fittedHeight,
      offsetY: paintingDef.offsetY ?? height / 2,
      fps: paintingDef.fps ?? 12,
      idleFrame: paintingDef.idleFrame ?? 0,
      alphaCutoff: paintingDef.alphaCutoff ?? 0.02,
      billboard: paintingDef.billboard ?? false,
      animate: paintingDef.animate ?? true,
    });
    Game.ecs.addComponent(worldRef, "Painting", painting, {
      id: paintingDef.id || textureKey,
    });
    Game.ecs.addComponent(worldRef, "Label", painting, {
      text: paintingDef.label ?? paintingDef.id ?? textureKey,
      color: paintingDef.labelColor || null,
      offsetY: paintingDef.labelOffsetY ?? 0.1,
    });
  }

  const cameraDef = level.camera || {};
  const cameraEntity = Game.ecs.createEntity(worldRef);
  Game.ecs.addComponent(worldRef, "Transform", cameraEntity, {
    pos: { x: spawn.x, y: spawn.y + 2, z: spawn.z + 4 },
    rotY: 0,
  });
  Game.ecs.addComponent(worldRef, "CameraFollow", cameraEntity, {
    target: player,
    distance: cameraDef.distance ?? 4,
    height: cameraDef.height ?? 2.2,
    lookHeight: cameraDef.lookHeight ?? 1,
    side: cameraDef.side ?? 0,
    smooth: cameraDef.smooth ?? 0.15,
  });
  Game.ecs.addComponent(worldRef, "CameraRig", cameraEntity, {
    yaw: worldRef.components.Transform.get(player).rotY,
  });
  worldRef.resources.cameraId = cameraEntity;
};
