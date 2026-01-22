window.Game = window.Game || {};
Game.utils = Game.utils || {};

Game.utils.gameToWorld = function gameToWorld(pos) {
  const size = Game.config.gridSize;
  return {
    x: pos.x * size,
    y: -pos.y * size,
    z: pos.z * size,
  };
};

Game.utils.blockKey = function blockKey(x, y, z) {
  return `${x}|${y}|${z}`;
};

Game.utils.isBlockAt = function isBlockAt(worldRef, x, y, z) {
  return worldRef.resources.blockSet.has(Game.utils.blockKey(x, y, z));
};

Game.utils.forEachBlockInAabb = function forEachBlockInAabb(
  worldRef,
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
  fn
) {
  const x0 = Math.floor(minX);
  const x1 = Math.floor(maxX);
  const y0 = Math.floor(minY);
  const y1 = Math.floor(maxY);
  const z0 = Math.floor(minZ);
  const z1 = Math.floor(maxZ);

  for (let y = y0; y <= y1; y += 1) {
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (Game.utils.isBlockAt(worldRef, x, y, z)) {
          fn(x, y, z);
        }
      }
    }
  }
};
