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

  const streaming = worldRef.resources.paintingStreaming;
  if (!streaming) {
    return;
  }
  const textures = worldRef.resources.textures || {};
  const loading = streaming.loading || new Map();
  const failed = streaming.failed || new Set();
  streaming.loading = loading;
  streaming.failed = failed;

  const loadRadius = streaming.loadRadius ?? 6;
  const maxConcurrent = streaming.maxConcurrent ?? 2;
  let activeLoads = 0;
  for (const entry of loading.values()) {
    if (entry && entry.state === "loading") {
      activeLoads += 1;
    }
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
    if (textures[textureKey] || failed.has(textureKey) || loading.has(textureKey)) {
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
      candidates.push({ textureKey, imagePath, dist });
    }
  }

  if (candidates.length === 0) {
    return;
  }
  candidates.sort((a, b) => a.dist - b.dist);

  for (const candidate of candidates) {
    if (activeLoads >= maxConcurrent) {
      break;
    }
    activeLoads += 1;
    loading.set(candidate.textureKey, { state: "loading" });
    Game.assets
      .loadSpriteTexture(candidate.imagePath)
      .then((paintingTex) => {
        if (!Game.rendering.isValidTexture(paintingTex.texture)) {
          throw new Error("Invalid texture instance");
        }
        if (worldRef?.resources?.textures) {
          worldRef.resources.textures[candidate.textureKey] = paintingTex;
        }
        if (Game.level?.updatePaintingSpriteForTexture) {
          Game.level.updatePaintingSpriteForTexture(worldRef, candidate.textureKey);
        }
        loading.delete(candidate.textureKey);
      })
      .catch((err) => {
        console.warn(`Missing painting: ${candidate.imagePath}`, err);
        loading.delete(candidate.textureKey);
        failed.add(candidate.textureKey);
      });
  }
};
