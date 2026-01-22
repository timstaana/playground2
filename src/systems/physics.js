window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.physicsSystem = function physicsSystem(worldRef, dt) {
  for (const [entity, transform] of worldRef.components.Transform.entries()) {
    if (worldRef.components.RemotePlayer?.has(entity)) {
      continue;
    }
    const vel = worldRef.components.Velocity.get(entity);
    const collider = worldRef.components.Collider.get(entity);
    if (!vel || !collider) {
      continue;
    }

    const move = worldRef.components.MoveIntent.get(entity);
    let grounded = false;

    const halfW = collider.w / 2;
    const halfD = collider.d / 2;
    const eps = 1e-4;
    const pos = { ...transform.pos };

    if (vel.x !== 0) {
      let nextX = pos.x + vel.x * dt;
      const minX = nextX - halfW + eps;
      const maxX = nextX + halfW - eps;
      const minY = pos.y + eps;
      const maxY = pos.y + collider.h - eps;
      const minZ = pos.z - halfD + eps;
      const maxZ = pos.z + halfD - eps;

      if (vel.x > 0) {
        let closest = Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (x) => {
            if (x < closest) {
              closest = x;
            }
          }
        );
        if (closest !== Infinity) {
          nextX = Math.min(nextX, closest - halfW);
          vel.x = 0;
        }
      } else {
        let closest = -Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (x) => {
            const edge = x + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
        if (closest !== -Infinity) {
          nextX = Math.max(nextX, closest + halfW);
          vel.x = 0;
        }
      }
      pos.x = nextX;
    }

    if (vel.z !== 0) {
      let nextZ = pos.z + vel.z * dt;
      const minX = pos.x - halfW + eps;
      const maxX = pos.x + halfW - eps;
      const minY = pos.y + eps;
      const maxY = pos.y + collider.h - eps;
      const minZ = nextZ - halfD + eps;
      const maxZ = nextZ + halfD - eps;

      if (vel.z > 0) {
        let closest = Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, _y, z) => {
            if (z < closest) {
              closest = z;
            }
          }
        );
        if (closest !== Infinity) {
          nextZ = Math.min(nextZ, closest - halfD);
          vel.z = 0;
        }
      } else {
        let closest = -Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, _y, z) => {
            const edge = z + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
        if (closest !== -Infinity) {
          nextZ = Math.max(nextZ, closest + halfD);
          vel.z = 0;
        }
      }
      pos.z = nextZ;
    }

    if (vel.y !== 0) {
      let nextY = pos.y + vel.y * dt;
      const minX = pos.x - halfW + eps;
      const maxX = pos.x + halfW - eps;
      const minY = nextY + eps;
      const maxY = nextY + collider.h - eps;
      const minZ = pos.z - halfD + eps;
      const maxZ = pos.z + halfD - eps;

      if (vel.y > 0) {
        let closest = Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, y) => {
            if (y < closest) {
              closest = y;
            }
          }
        );
        if (closest !== Infinity) {
          nextY = Math.min(nextY, closest - collider.h);
          vel.y = 0;
        }
      } else {
        let closest = -Infinity;
        Game.utils.forEachBlockInAabb(
          worldRef,
          minX,
          maxX,
          minY,
          maxY,
          minZ,
          maxZ,
          (_x, y) => {
            const edge = y + 1;
            if (edge > closest) {
              closest = edge;
            }
          }
        );
        if (closest !== -Infinity) {
          nextY = Math.max(nextY, closest);
          vel.y = 0;
          grounded = true;
        }
      }
      pos.y = nextY;
    }

    transform.pos = pos;
    worldRef.components.Transform.set(entity, transform);
    worldRef.components.Velocity.set(entity, vel);

    if (move) {
      move.grounded = grounded;
      worldRef.components.MoveIntent.set(entity, move);
    }
  }
};
