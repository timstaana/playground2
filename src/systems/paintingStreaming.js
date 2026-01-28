window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.paintingStreamingSystem = function paintingStreamingSystem(
  worldRef
) {
  if (!worldRef) {
    return;
  }
  const playerId = worldRef.resources.playerId;
  if (!playerId) {
    return;
  }
  const playerTransform = worldRef.components.Transform.get(playerId);
  if (!playerTransform) {
    return;
  }
  const playerVelocity = worldRef.components.Velocity.get(playerId);
  const playerMove = worldRef.components.MoveIntent.get(playerId);
  const speed =
    playerVelocity && typeof playerVelocity === "object"
      ? Math.hypot(
          playerVelocity.x || 0,
          playerVelocity.y || 0,
          playerVelocity.z || 0
        )
      : 0;
  const intent =
    playerMove && typeof playerMove === "object"
      ? Math.max(
          Math.abs(playerMove.throttle || 0),
          Math.abs(playerMove.turn || 0)
        )
      : 0;
  const isMoving = speed > 0.05 || intent > 0.01;

  const streaming = worldRef.resources.paintingStreaming;
  if (!streaming) {
    return;
  }
  const textures = worldRef.resources.textures || {};
  const loading = streaming.loading || new Map();
  const failed = streaming.failed || new Set();
  const pending = streaming.pending || new Map();
  streaming.loading = loading;
  streaming.failed = failed;
  streaming.pending = pending;

  const loadRadius = streaming.loadRadius ?? 6;
  const maxConcurrent = streaming.maxConcurrent ?? 2;
  const maxAnimatedConcurrent = streaming.maxAnimatedConcurrent ?? 1;
  const deferAnimatedWhileMoving =
    streaming.deferAnimatedWhileMoving !== false;
  const pendingPerFrame = streaming.pendingPerFrame ?? 1;
  let activeLoads = 0;
  let activeAnimatedLoads = 0;
  for (const entry of loading.values()) {
    if (entry && entry.state === "loading") {
      activeLoads += 1;
      if (entry.isAnimated) {
        activeAnimatedLoads += 1;
      }
    }
  }

  const scheduleFinalize = () => {
    if (streaming.finalizeScheduled) {
      return;
    }
    streaming.finalizeScheduled = true;
    const runFinalize = (deadline) => {
      streaming.finalizeScheduled = false;
      let processed = 0;
      const start =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const budgetMs = streaming.pendingBudgetMs ?? 6;
      for (const [textureKey, entry] of pending.entries()) {
        if (processed >= pendingPerFrame) {
          break;
        }
        if (
          deadline &&
          typeof deadline.timeRemaining === "function" &&
          !deadline.didTimeout &&
          deadline.timeRemaining() < 1
        ) {
          break;
        }
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - start > budgetMs) {
          break;
        }
        processed += 1;
        try {
          const bitmap = entry && entry.bitmap ? entry.bitmap : null;
          const image = entry && entry.image ? entry.image : entry;
          const source = bitmap || image;
          const paintingTex = Game.assets.buildSpriteTexture(source, {
            forceGraphics: !!bitmap,
          });
          if (!Game.rendering.isValidTexture(paintingTex.texture)) {
            throw new Error("Invalid texture instance");
          }
          worldRef.resources.textures[textureKey] = paintingTex;
          if (Game.level?.updatePaintingSpriteForTexture) {
            Game.level.updatePaintingSpriteForTexture(worldRef, textureKey);
          }
          if (bitmap && typeof bitmap.close === "function") {
            bitmap.close();
          }
        } catch (err) {
          console.warn(`Failed to finalize painting: ${textureKey}`, err);
          failed.add(textureKey);
        }
        pending.delete(textureKey);
      }
      if (pending.size > 0) {
        scheduleFinalize();
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(runFinalize, {
        timeout: streaming.pendingTimeoutMs ?? 50,
      });
    } else {
      setTimeout(
        () => runFinalize({ timeRemaining: () => 0, didTimeout: true }),
        0
      );
    }
  };

  if (pending.size > 0) {
    scheduleFinalize();
  }

  const candidates = [];
  for (const [entity, painting] of worldRef.components.Painting.entries()) {
    if (!painting) {
      continue;
    }
    const textureKey = painting.textureKey || painting.id;
    const imagePath = painting.image;
    if (!textureKey || !imagePath) {
      continue;
    }
    if (
      textures[textureKey] ||
      failed.has(textureKey) ||
      loading.has(textureKey) ||
      pending.has(textureKey)
    ) {
      continue;
    }
    const transform = worldRef.components.Transform.get(entity);
    if (!transform) {
      continue;
    }
    const radius = painting.loadRadius ?? loadRadius;
    const dx = transform.pos.x - playerTransform.pos.x;
    const dy = transform.pos.y - playerTransform.pos.y;
    const dz = transform.pos.z - playerTransform.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= radius) {
      const lower =
        typeof imagePath === "string" ? imagePath.toLowerCase() : "";
      const isAnimated = painting.animate === true || lower.endsWith(".gif");
      candidates.push({ textureKey, imagePath, dist, isAnimated });
    }
  }

  if (candidates.length === 0) {
    return;
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const queueLoad = (candidate) => {
    const imagePath = candidate.imagePath;
    const lower =
      typeof imagePath === "string" ? imagePath.toLowerCase() : "";
    const isGif = lower.endsWith(".gif");
    const useBitmap =
      !isGif && typeof Game.assets?.loadImageBitmapAsync === "function";
    loading.set(candidate.textureKey, {
      state: "loading",
      useBitmap,
      isAnimated: isGif,
    });
    if (useBitmap) {
      Game.assets
        .loadImageBitmapAsync(imagePath)
        .then((bitmap) => {
          loading.delete(candidate.textureKey);
          pending.set(candidate.textureKey, { bitmap });
        })
        .catch((err) => {
          console.warn(`Failed bitmap load: ${imagePath}`, err);
          loading.delete(candidate.textureKey);
          failed.add(candidate.textureKey);
        });
      return;
    }
    Game.assets
      .loadImageAsync(imagePath)
      .then((img) => {
        loading.delete(candidate.textureKey);
        pending.set(candidate.textureKey, { image: img });
      })
      .catch((err) => {
        console.warn(`Missing painting: ${imagePath}`, err);
        loading.delete(candidate.textureKey);
        failed.add(candidate.textureKey);
      });
  };

  for (const candidate of candidates) {
    if (activeLoads >= maxConcurrent) {
      break;
    }
    if (candidate.isAnimated) {
      if (deferAnimatedWhileMoving && isMoving) {
        continue;
      }
      if (activeAnimatedLoads >= maxAnimatedConcurrent) {
        continue;
      }
    }
    activeLoads += 1;
    if (candidate.isAnimated) {
      activeAnimatedLoads += 1;
    }
    queueLoad(candidate);
  }
};
