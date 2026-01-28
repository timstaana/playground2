window.Game = window.Game || {};
Game.level = Game.level || {};

Game.level.fitSpriteToBounds = function fitSpriteToBounds(width, height, aspect) {
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
  return { width: fittedWidth, height: fittedHeight };
};

Game.level.updatePaintingSpriteForTexture =
  function updatePaintingSpriteForTexture(worldRef, textureKey) {
    if (!worldRef || !textureKey) {
      return;
    }
    const texRef = worldRef.resources?.textures?.[textureKey];
    const texSource = texRef?.source || texRef?.texture;
    if (!texSource || !texSource.width || !texSource.height) {
      return;
    }
    const aspect = texSource.width / texSource.height;
    for (const [entity, painting] of worldRef.components.Painting.entries()) {
      const paintingKey = painting?.textureKey || painting?.id;
      if (paintingKey !== textureKey) {
        continue;
      }
      const collider = worldRef.components.Collider.get(entity);
      const sprite = worldRef.components.BillboardSprite.get(entity);
      if (!collider || !sprite) {
        continue;
      }
      const fit = Game.level.fitSpriteToBounds(
        collider.w,
        collider.h,
        aspect
      );
      sprite.width = fit.width;
      sprite.height = fit.height;
      worldRef.components.BillboardSprite.set(entity, sprite);
    }
  };

Game.level.buildLevel = function buildLevel(worldRef, level) {
  Game.config.gridSize = level.gridSize || Game.config.gridSize;

  const gravityValue = level.gravity ?? 18;
  const playerDef = level.player || {};
  const playerSpriteDef = playerDef.sprite || {};
  const renderingDef = level.rendering || {};
  const interactionDef = level.interaction || {};
  const playerSize = playerDef.size || { w: 1, d: 1, h: 1.5 };
  const playerSpeed = playerDef.speed ?? 4;
  const playerTurnSpeed = playerDef.turnSpeed ?? 2.6;
  const jumpHeight = playerDef.jumpHeight ?? 1.5;
  const spawn = playerDef.spawn || { x: 2.5, y: 1, z: 2.5 };

  worldRef.resources.rendering.blockCullDistance =
    renderingDef.blockCullDistance ??
    worldRef.resources.rendering.blockCullDistance;
  worldRef.resources.rendering.blockCullFovPadding =
    renderingDef.blockCullFovPadding ??
    worldRef.resources.rendering.blockCullFovPadding;
  worldRef.resources.rendering.blockChunkSize =
    renderingDef.blockChunkSize ??
    renderingDef.chunkSize ??
    worldRef.resources.rendering.blockChunkSize;
  worldRef.resources.rendering.blockAoStrength =
    renderingDef.blockAoStrength ??
    renderingDef.aoStrength ??
    worldRef.resources.rendering.blockAoStrength;
  worldRef.resources.rendering.blockAoMin =
    renderingDef.blockAoMin ??
    renderingDef.aoMin ??
    worldRef.resources.rendering.blockAoMin;
  worldRef.resources.rendering.blockAoPower =
    renderingDef.blockAoPower ??
    renderingDef.aoPower ??
    worldRef.resources.rendering.blockAoPower;
  const interactionDefaults = {
    range: interactionDef.range ?? 1.5,
    requireFacing: interactionDef.requireFacing ?? true,
    facingDot: interactionDef.facingDot ?? 0.2,
    lightboxDistanceScale: interactionDef.lightboxDistanceScale ?? 1.4,
    lightboxDistanceOffset: interactionDef.lightboxDistanceOffset ?? 0.6,
    lightboxYOffset: interactionDef.lightboxYOffset ?? 0,
    lightboxSmooth: interactionDef.lightboxSmooth ?? 0.2,
    dialogueDistanceScale:
      interactionDef.dialogueDistanceScale ??
      interactionDef.lightboxDistanceScale ??
      1.6,
    dialogueDistanceOffset:
      interactionDef.dialogueDistanceOffset ??
      interactionDef.lightboxDistanceOffset ??
      0.8,
    dialogueYOffset: interactionDef.dialogueYOffset ?? 0,
    dialogueShoulderOffset:
      interactionDef.dialogueShoulderOffset ??
      interactionDef.dialogueSide ??
      0.6,
  };
  const streamingDef = level.paintingStreaming || level.streaming || {};
  const paintingStreaming = worldRef.resources.paintingStreaming;
  if (paintingStreaming) {
    paintingStreaming.loadRadius =
      streamingDef.loadRadius ??
      streamingDef.paintingLoadRadius ??
      paintingStreaming.loadRadius;
    paintingStreaming.indicatorRadius =
      streamingDef.indicatorRadius ??
      streamingDef.loadRadius ??
      paintingStreaming.indicatorRadius;
    paintingStreaming.maxConcurrent =
      streamingDef.maxConcurrent ??
      streamingDef.paintingMaxConcurrent ??
      paintingStreaming.maxConcurrent;
  }

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
    const blockKey = Game.utils.blockKey(block.x, block.y, block.z);
    worldRef.resources.blockSet.add(blockKey);
    worldRef.resources.blockIndex.set(blockKey, blockEntity);
  }
  Game.rendering?.rebuildAllBlockChunks?.(worldRef);
  if (worldRef.components?.StaticBlock) {
    for (const [entity, block] of worldRef.components.StaticBlock.entries()) {
      if (!block) {
        continue;
      }
      let changed = false;
      if ("ao" in block) {
        delete block.ao;
        changed = true;
      }
      if ("aoDirty" in block) {
        delete block.aoDirty;
        changed = true;
      }
      if ("aoMode" in block) {
        delete block.aoMode;
        changed = true;
      }
      if (changed) {
        worldRef.components.StaticBlock.set(entity, block);
      }
    }
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
    const npcDialogue = npcDef.dialogue;
    let dialoguePayload = null;
    if (typeof npcDialogue === "string") {
      dialoguePayload = { lines: [npcDialogue] };
    } else if (Array.isArray(npcDialogue)) {
      dialoguePayload = { lines: npcDialogue };
    } else if (npcDialogue && typeof npcDialogue === "object") {
      const lines = Array.isArray(npcDialogue.lines)
        ? npcDialogue.lines
        : npcDialogue.text
        ? [npcDialogue.text]
        : [];
      dialoguePayload = {
        name: npcDialogue.name,
        lines,
        color: npcDialogue.color,
        camera:
          npcDialogue.camera && typeof npcDialogue.camera === "object"
            ? npcDialogue.camera
            : null,
      };
    }

    if (dialoguePayload) {
      const cameraDefaults = dialoguePayload.camera || {};
      Game.ecs.addComponent(worldRef, "Dialogue", npc, {
        name:
          dialoguePayload.name ??
          npcDef.label ??
          npcDef.name ??
          npcDef.id ??
          `npc-${i + 1}`,
        lines: dialoguePayload.lines,
        color: dialoguePayload.color || null,
        camera: {
          distanceScale:
            cameraDefaults.distanceScale ??
            interactionDefaults.dialogueDistanceScale,
          distanceOffset:
            cameraDefaults.distanceOffset ??
            interactionDefaults.dialogueDistanceOffset,
          yOffset: cameraDefaults.yOffset ?? interactionDefaults.dialogueYOffset,
          shoulderOffset:
            cameraDefaults.shoulderOffset ??
            cameraDefaults.side ??
            interactionDefaults.dialogueShoulderOffset,
        },
      });
    }

    const npcInteraction = npcDef.interaction ?? (dialoguePayload ? {} : null);
    if (npcInteraction !== null && npcInteraction !== false) {
      const interactionConfig =
        npcInteraction && typeof npcInteraction === "object"
          ? npcInteraction
          : {};
      Game.ecs.addComponent(worldRef, "Interaction", npc, {
        kind: interactionConfig.kind || interactionConfig.type || "dialogue",
        range: interactionConfig.range ?? interactionDefaults.range,
        requireFacing:
          interactionConfig.requireFacing ?? interactionDefaults.requireFacing,
        facingDot: interactionConfig.facingDot ?? interactionDefaults.facingDot,
        highlightColor: interactionConfig.highlightColor || null,
        highlightScale: interactionConfig.highlightScale ?? null,
        highlightThickness: interactionConfig.highlightThickness ?? null,
      });
    }
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
    const fit = Game.level.fitSpriteToBounds(width, height, aspect);
    const fittedWidth = fit.width;
    const fittedHeight = fit.height;

    const bottomCenter = {
      x: anchorPos.x + width / 2,
      y: anchorPos.y,
      z: anchorPos.z + depth / 2,
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
    const interactionData = paintingDef.interaction;
    if (interactionData !== false) {
      const interactionConfig =
        interactionData && typeof interactionData === "object"
          ? interactionData
          : {};
      Game.ecs.addComponent(worldRef, "Interaction", painting, {
        kind: interactionConfig.kind || interactionConfig.type || "lightbox",
        range: interactionConfig.range ?? interactionDefaults.range,
        requireFacing:
          interactionConfig.requireFacing ?? interactionDefaults.requireFacing,
        facingDot: interactionConfig.facingDot ?? interactionDefaults.facingDot,
        highlightColor: interactionConfig.highlightColor || null,
        highlightScale: interactionConfig.highlightScale ?? null,
        highlightThickness: interactionConfig.highlightThickness ?? null,
      });
    }
    const lightboxData = paintingDef.lightbox;
    if (lightboxData !== false) {
      const lightboxConfig =
        lightboxData && typeof lightboxData === "object" ? lightboxData : {};
      Game.ecs.addComponent(worldRef, "Lightbox", painting, {
        distanceScale:
          lightboxConfig.distanceScale ?? interactionDefaults.lightboxDistanceScale,
        distanceOffset:
          lightboxConfig.distanceOffset ?? interactionDefaults.lightboxDistanceOffset,
        yOffset: lightboxConfig.yOffset ?? interactionDefaults.lightboxYOffset,
        smooth: lightboxConfig.smooth ?? interactionDefaults.lightboxSmooth,
      });
    }
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
      textureKey,
      image: paintingDef.image || paintingDef.src || null,
      loadRadius:
        paintingDef.loadRadius ??
        paintingDef.streamingRadius ??
        paintingDef.lazyRadius ??
        null,
      indicatorRadius: paintingDef.indicatorRadius ?? null,
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
    avoidStep: cameraDef.avoidStep ?? 0.6,
    avoidMax: cameraDef.avoidMax ?? 3,
    avoidPreferUp:
      typeof cameraDef.avoidPreferUp === "boolean"
        ? cameraDef.avoidPreferUp
        : true,
    avoidMinY:
      typeof cameraDef.avoidMinY === "number" ? cameraDef.avoidMinY : null,
    avoidMaxY:
      typeof cameraDef.avoidMaxY === "number" ? cameraDef.avoidMaxY : null,
  });
  const initialLookHeight = cameraDef.lookHeight ?? 1;
  Game.ecs.addComponent(worldRef, "CameraRig", cameraEntity, {
    yaw: worldRef.components.Transform.get(player).rotY,
    dialogueBlend: 0,
    lookOffsetY: 0,
    focusBlend: 0,
    dialogueTargetId: null,
    facingDir: 1,
    avoidOffsetY: 0,
    lookAt: {
      x: spawn.x,
      y: spawn.y + initialLookHeight,
      z: spawn.z,
    },
  });
  Game.ecs.addComponent(worldRef, "Lightbox", cameraEntity, {
    mode: "follow",
    targetId: null,
    distanceScale: interactionDefaults.lightboxDistanceScale,
    distanceOffset: interactionDefaults.lightboxDistanceOffset,
    yOffset: interactionDefaults.lightboxYOffset,
    smooth: interactionDefaults.lightboxSmooth,
  });
  Game.ecs.addComponent(worldRef, "DialogueState", cameraEntity, {
    mode: "idle",
    targetId: null,
  });
  worldRef.resources.cameraId = cameraEntity;
};
