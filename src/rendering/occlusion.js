window.Game = window.Game || {};
Game.rendering = Game.rendering || {};

Game.rendering.computeOccluders = function computeOccluders(worldRef, cameraPos) {
  const occluders = new Map();
  const playerId = worldRef.resources.playerId;
  if (!playerId) {
    return occluders;
  }

  const transform = worldRef.components.Transform.get(playerId);
  const collider = worldRef.components.Collider.get(playerId);
  const sprite = worldRef.components.BillboardSprite.get(playerId);
  if (!transform || !collider) {
    return occluders;
  }

  const rendering = worldRef.resources.rendering;
  const radius = rendering.occluderConeRadius ?? 1.4;
  const height = rendering.occluderConeHeight ?? 0.9;
  const samples = rendering.occluderConeSamples ?? 12;
  const rings = Math.max(1, rendering.occluderConeRings ?? 3);
  const heightSteps = Math.max(1, rendering.occluderConeHeights ?? 3);
  const heightFractions = Game.rendering.buildSymmetricFractions(heightSteps, 0.35);

  const baseY = transform.pos.y + (sprite?.offsetY ?? collider.h / 2);
  const center = { x: transform.pos.x, y: baseY, z: transform.pos.z };

  Game.rendering.traceRayOccluders(worldRef, cameraPos, center, 1, occluders);

  for (let ring = 1; ring <= rings; ring += 1) {
    const rFrac = ring / rings;
    for (let i = 0; i < samples; i += 1) {
      const angle = (i / samples) * TWO_PI;
      const dx = Math.cos(angle) * radius * rFrac;
      const dz = Math.sin(angle) * radius * rFrac;
      for (const hFrac of heightFractions) {
        const dy = height * hFrac;
        const norm = Math.sqrt(rFrac * rFrac + hFrac * hFrac);
        const weight = Math.max(0, 1 - norm);
        if (weight <= 0) {
          continue;
        }
        Game.rendering.traceRayOccluders(
          worldRef,
          cameraPos,
          { x: center.x + dx, y: center.y + dy, z: center.z + dz },
          weight,
          occluders
        );
      }
    }
  }

  return occluders;
};

Game.rendering.traceRayOccluders = function traceRayOccluders(
  worldRef,
  start,
  end,
  weight,
  outMap
) {
  const dir = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  };
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < 1e-6) {
    return;
  }

  dir.x /= len;
  dir.y /= len;
  dir.z /= len;

  let x = Math.floor(start.x);
  let y = Math.floor(start.y);
  let z = Math.floor(start.z);
  const endX = Math.floor(end.x);
  const endY = Math.floor(end.y);
  const endZ = Math.floor(end.z);

  const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
  const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
  const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

  let tMaxX = Infinity;
  let tMaxY = Infinity;
  let tMaxZ = Infinity;

  if (stepX > 0) {
    tMaxX = (x + 1 - start.x) / dir.x;
  } else if (stepX < 0) {
    tMaxX = (start.x - x) / -dir.x;
  }

  if (stepY > 0) {
    tMaxY = (y + 1 - start.y) / dir.y;
  } else if (stepY < 0) {
    tMaxY = (start.y - y) / -dir.y;
  }

  if (stepZ > 0) {
    tMaxZ = (z + 1 - start.z) / dir.z;
  } else if (stepZ < 0) {
    tMaxZ = (start.z - z) / -dir.z;
  }

  let steps = 0;
  const maxSteps = Math.ceil(len * 3) + 3;
  const baseAlpha = worldRef.resources.rendering.occluderAlpha ?? 0.35;
  const fadeDistance =
    worldRef.resources.rendering.occluderFadeDistance ?? 0;

  while (steps < maxSteps) {
    if (x === endX && y === endY && z === endZ) {
      break;
    }

    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        tMaxX += tDeltaX;
      } else {
        z += stepZ;
        tMaxZ += tDeltaZ;
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      tMaxY += tDeltaY;
    } else {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }

    if (x === endX && y === endY && z === endZ) {
      break;
    }

    if (Game.utils.isBlockAt(worldRef, x, y, z)) {
      let combinedWeight = weight;
      if (fadeDistance > 0) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        const cz = z + 0.5;
        const distToTarget = Math.hypot(cx - end.x, cy - end.y, cz - end.z);
        const fade = Math.max(0, 1 - distToTarget / fadeDistance);
        combinedWeight *= fade;
      }

      if (combinedWeight > 0) {
        const alpha = 1 - (1 - baseAlpha) * combinedWeight;
        const key = Game.utils.blockKey(x, y, z);
        const existing = outMap.get(key);
        if (existing === undefined || alpha < existing) {
          outMap.set(key, alpha);
        }
      }
    }

    steps += 1;
  }
};

Game.rendering.buildSymmetricFractions = function buildSymmetricFractions(
  count,
  maxAbs
) {
  if (count <= 1) {
    return [0];
  }
  const fractions = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    fractions.push((t * 2 - 1) * maxAbs);
  }
  return fractions;
};
