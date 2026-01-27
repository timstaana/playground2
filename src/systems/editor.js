window.Game = window.Game || {};
Game.systems = Game.systems || {};

Game.systems.ensureEditorState = function ensureEditorState(worldRef) {
  if (!worldRef || !worldRef.resources) {
    return null;
  }
  if (!worldRef.resources.editor) {
    worldRef.resources.editor = {
      enabled: true,
      hoveredBlock: null,
      hoverMaxDistance: 20,
      hoverColor: [255, 200, 120],
      hoverThickness: 2,
      hoverScale: 1.02,
      blockColor: [110, 145, 110],
      consumeClicks: true,
      holdDelay: 200,
      dragThreshold: 6,
      dragActive: false,
      dragEntity: null,
      dragCell: null,
      dragPlaneY: 0,
      pointerDown: false,
      pointerDownAt: 0,
      pointerStart: null,
      pointerHit: null,
      pointerHeld: false,
      selectedCell: null,
      selectedEntity: null,
      selectedColor: [120, 220, 255],
      selectedThickness: 3,
      selectedScale: 1.08,
      blockIndex: new Map(),
    };
  }
  return worldRef.resources.editor;
};

Game.systems.raycastBlocks = function raycastBlocks(
  worldRef,
  ray,
  maxDistance
) {
  if (!worldRef || !worldRef.resources?.blockSet || !ray) {
    return null;
  }
  const origin = ray.origin;
  const dir = Game.systems.normalizeVector(ray.dir);
  const distanceLimit =
    typeof maxDistance === "number" && maxDistance > 0 ? maxDistance : 20;
  if (!origin || !dir) {
    return null;
  }

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  if (Game.utils.isBlockAt(worldRef, x, y, z)) {
    return {
      x,
      y,
      z,
      distance: 0,
      normal: null,
      hitPos: { x: origin.x, y: origin.y, z: origin.z },
    };
  }

  const stepX = dir.x >= 0 ? 1 : -1;
  const stepY = dir.y >= 0 ? 1 : -1;
  const stepZ = dir.z >= 0 ? 1 : -1;

  const invX = Math.abs(dir.x) > 1e-6 ? 1 / dir.x : 0;
  const invY = Math.abs(dir.y) > 1e-6 ? 1 / dir.y : 0;
  const invZ = Math.abs(dir.z) > 1e-6 ? 1 / dir.z : 0;

  const nextX = stepX > 0 ? x + 1 : x;
  const nextY = stepY > 0 ? y + 1 : y;
  const nextZ = stepZ > 0 ? z + 1 : z;

  let tMaxX =
    Math.abs(dir.x) > 1e-6 ? (nextX - origin.x) * invX : Infinity;
  let tMaxY =
    Math.abs(dir.y) > 1e-6 ? (nextY - origin.y) * invY : Infinity;
  let tMaxZ =
    Math.abs(dir.z) > 1e-6 ? (nextZ - origin.z) * invZ : Infinity;

  const tDeltaX = Math.abs(dir.x) > 1e-6 ? Math.abs(invX) : Infinity;
  const tDeltaY = Math.abs(dir.y) > 1e-6 ? Math.abs(invY) : Infinity;
  const tDeltaZ = Math.abs(dir.z) > 1e-6 ? Math.abs(invZ) : Infinity;

  let traveled = 0;
  let lastStep = null;
  while (traveled <= distanceLimit) {
    if (tMaxX < tMaxY) {
      if (tMaxX < tMaxZ) {
        x += stepX;
        traveled = tMaxX;
        tMaxX += tDeltaX;
        lastStep = { axis: "x", step: stepX };
      } else {
        z += stepZ;
        traveled = tMaxZ;
        tMaxZ += tDeltaZ;
        lastStep = { axis: "z", step: stepZ };
      }
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      traveled = tMaxY;
      tMaxY += tDeltaY;
      lastStep = { axis: "y", step: stepY };
    } else {
      z += stepZ;
      traveled = tMaxZ;
      tMaxZ += tDeltaZ;
      lastStep = { axis: "z", step: stepZ };
    }

    if (traveled > distanceLimit) {
      break;
    }
    if (Game.utils.isBlockAt(worldRef, x, y, z)) {
      const normal = { x: 0, y: 0, z: 0 };
      if (lastStep) {
        if (lastStep.axis === "x") {
          normal.x = -lastStep.step;
        } else if (lastStep.axis === "y") {
          normal.y = -lastStep.step;
        } else if (lastStep.axis === "z") {
          normal.z = -lastStep.step;
        }
      }
      const hitPos = {
        x: origin.x + dir.x * traveled,
        y: origin.y + dir.y * traveled,
        z: origin.z + dir.z * traveled,
      };
      return { x, y, z, distance: traveled, normal, hitPos };
    }
  }

  return null;
};

Game.systems.ensureEditorBlockIndex =
  function ensureEditorBlockIndex(worldRef, editor) {
  if (!editor.blockIndex) {
    editor.blockIndex = new Map();
  }
  const blockSetSize = worldRef?.resources?.blockSet?.size ?? 0;
  const globalIndex = worldRef?.resources?.blockIndex;
  if (globalIndex) {
    editor.blockIndex = globalIndex;
    if (globalIndex.size === blockSetSize) {
      return;
    }
    globalIndex.clear();
  } else if (editor.blockIndex.size === blockSetSize) {
    return;
  } else {
    editor.blockIndex.clear();
  }
  if (!worldRef || !worldRef.components?.StaticBlock) {
    return;
  }
  for (const [entity] of worldRef.components.StaticBlock.entries()) {
    const transform = worldRef.components.Transform.get(entity);
    if (!transform || !transform.pos) {
      continue;
    }
    const cell = {
      x: Math.floor(transform.pos.x),
      y: Math.floor(transform.pos.y),
      z: Math.floor(transform.pos.z),
    };
    const key = Game.utils.blockKey(cell.x, cell.y, cell.z);
    const targetIndex = globalIndex || editor.blockIndex;
    targetIndex.set(key, entity);
  }
};

Game.systems.getEditorBlockEntityAt =
  function getEditorBlockEntityAt(editor, x, y, z) {
    if (!editor?.blockIndex) {
      return null;
    }
    return editor.blockIndex.get(Game.utils.blockKey(x, y, z)) ?? null;
  };

Game.systems.addEditorBlock = function addEditorBlock(
  worldRef,
  x,
  y,
  z,
  color
) {
  if (!worldRef || !worldRef.resources) {
    return false;
  }
  if (Game.utils.isBlockAt(worldRef, x, y, z)) {
    return false;
  }
  const blockEntity = Game.ecs.createEntity(worldRef);
  Game.ecs.addComponent(worldRef, "Transform", blockEntity, {
    pos: { x: x + 0.5, y, z: z + 0.5 },
    rotY: 0,
  });
  Game.ecs.addComponent(worldRef, "Collider", blockEntity, {
    w: 1,
    d: 1,
    h: 1,
  });
  Game.ecs.addComponent(worldRef, "Renderable", blockEntity, {
    color: color || [110, 145, 110],
    kind: "block",
  });
  Game.ecs.addComponent(worldRef, "StaticBlock", blockEntity, {});
  const key = Game.utils.blockKey(x, y, z);
  worldRef.resources.blockSet.add(key);
  if (worldRef.resources.blockIndex) {
    worldRef.resources.blockIndex.set(key, blockEntity);
  }
  const editor = worldRef.resources.editor;
  if (editor?.blockIndex) {
    editor.blockIndex.set(key, blockEntity);
  }
  Game.rendering?.markBlockAoDirtyAround?.(worldRef, x, y, z);
  return true;
};

Game.systems.moveEditorBlock = function moveEditorBlock(
  worldRef,
  editor,
  entity,
  toCell
) {
  if (!worldRef || !entity || !toCell) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (!transform || !transform.pos) {
    return false;
  }
  const fromCell = {
    x: Math.floor(transform.pos.x),
    y: Math.floor(transform.pos.y),
    z: Math.floor(transform.pos.z),
  };
  if (
    fromCell.x === toCell.x &&
    fromCell.y === toCell.y &&
    fromCell.z === toCell.z
  ) {
    return false;
  }
  const toKey = Game.utils.blockKey(toCell.x, toCell.y, toCell.z);
  const existing = editor?.blockIndex?.get(toKey);
  if (existing && existing !== entity) {
    return false;
  }
  const fromKey = Game.utils.blockKey(fromCell.x, fromCell.y, fromCell.z);
  worldRef.resources.blockSet.delete(fromKey);
  worldRef.resources.blockSet.add(toKey);
  if (worldRef.resources.blockIndex) {
    worldRef.resources.blockIndex.delete(fromKey);
    worldRef.resources.blockIndex.set(toKey, entity);
  }
  if (editor?.blockIndex) {
    editor.blockIndex.delete(fromKey);
    editor.blockIndex.set(toKey, entity);
  }
  transform.pos.x = toCell.x + 0.5;
  transform.pos.y = toCell.y;
  transform.pos.z = toCell.z + 0.5;
  worldRef.components.Transform.set(entity, transform);
  Game.rendering?.markBlockAoDirtyAround?.(worldRef, fromCell.x, fromCell.y, fromCell.z);
  Game.rendering?.markBlockAoDirtyAround?.(worldRef, toCell.x, toCell.y, toCell.z);
  return true;
};

Game.systems.deleteEditorBlock = function deleteEditorBlock(
  worldRef,
  editor,
  entity
) {
  if (!worldRef || !entity) {
    return false;
  }
  const transform = worldRef.components.Transform.get(entity);
  if (transform?.pos) {
    const cell = {
      x: Math.floor(transform.pos.x),
      y: Math.floor(transform.pos.y),
      z: Math.floor(transform.pos.z),
    };
    const key = Game.utils.blockKey(cell.x, cell.y, cell.z);
    worldRef.resources?.blockSet?.delete(key);
    worldRef.resources?.blockIndex?.delete(key);
    editor?.blockIndex?.delete(key);
    Game.rendering?.markBlockAoDirtyAround?.(worldRef, cell.x, cell.y, cell.z);
  }
  Game.ecs.removeEntity(worldRef, entity);
  return true;
};

Game.systems.deleteSelectedEditorBlock =
  function deleteSelectedEditorBlock(worldRef) {
    const editor = worldRef?.resources?.editor;
    const entity = editor?.selectedEntity;
    if (!editor || !entity) {
      return false;
    }
    const removed = Game.systems.deleteEditorBlock(worldRef, editor, entity);
    if (removed) {
      editor.selectedEntity = null;
      editor.selectedCell = null;
    }
    return removed;
  };

Game.systems.intersectRayPlaneY = function intersectRayPlaneY(ray, planeY) {
  if (!ray || !ray.origin || !ray.dir) {
    return null;
  }
  const denom = ray.dir.y;
  if (Math.abs(denom) < 1e-6) {
    return null;
  }
  const t = (planeY - ray.origin.y) / denom;
  if (t < 0) {
    return null;
  }
  return {
    x: ray.origin.x + ray.dir.x * t,
    y: ray.origin.y + ray.dir.y * t,
    z: ray.origin.z + ray.dir.z * t,
  };
};

Game.systems.editorSystem = function editorSystem(worldRef) {
  const editor = Game.systems.ensureEditorState(worldRef);
  if (!editor || !editor.enabled) {
    return;
  }
  Game.systems.ensureEditorBlockIndex(worldRef, editor);
  if (
    typeof mouseX !== "number" ||
    typeof mouseY !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    editor.hoveredBlock = null;
    return;
  }
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) {
    editor.hoveredBlock = null;
    return;
  }
  const ray = Game.systems.getCameraRayFromScreen(worldRef, mouseX, mouseY);
  if (!ray) {
    editor.hoveredBlock = null;
    return;
  }
  const hit = Game.systems.raycastBlocks(
    worldRef,
    ray,
    editor.hoverMaxDistance
  );
  editor.hoveredBlock = hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
  editor.lastRay = {
    origin: { ...ray.origin },
    dir: { ...ray.dir },
    hit,
  };

  const input = Game.systems.inputState;
  const leftDown =
    !!input?.mouseDown ||
    (typeof mouseIsPressed !== "undefined" &&
      mouseIsPressed &&
      (typeof mouseButton === "undefined" || mouseButton === LEFT));
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();

  if (leftDown && !editor.pointerDown) {
    editor.pointerDown = true;
    editor.pointerDownAt = now;
    editor.pointerHeld = false;
    editor.dragActive = false;
    editor.dragEntity = null;
    editor.dragCell = null;
    editor.pointerStart = input?.mouseDownPosition
      ? { ...input.mouseDownPosition }
      : { x: mouseX, y: mouseY };
    const downRay = Game.systems.getCameraRayFromScreen(
      worldRef,
      editor.pointerStart.x,
      editor.pointerStart.y
    );
    editor.pointerHit = downRay
      ? Game.systems.raycastBlocks(worldRef, downRay, editor.hoverMaxDistance)
      : null;
    if (editor.consumeClicks && input) {
      input.clickRequested = false;
      input.clickPosition = null;
    }
  }

  if (!leftDown && editor.pointerDown) {
    if (!editor.dragActive && !editor.pointerHeld && editor.pointerHit?.normal) {
      const place = {
        x: editor.pointerHit.x + editor.pointerHit.normal.x,
        y: editor.pointerHit.y + editor.pointerHit.normal.y,
        z: editor.pointerHit.z + editor.pointerHit.normal.z,
      };
      Game.systems.addEditorBlock(
        worldRef,
        place.x,
        place.y,
        place.z,
        editor.blockColor
      );
    }
    editor.pointerDown = false;
    editor.pointerStart = null;
    editor.pointerHit = null;
    editor.pointerHeld = false;
    editor.dragActive = false;
    editor.dragEntity = null;
    editor.dragCell = null;
  }

  if (editor.pointerDown) {
    if (!editor.pointerHeld) {
      const heldLong = now - (editor.pointerDownAt || now) >= (editor.holdDelay ?? 200);
      if (heldLong) {
        editor.pointerHeld = true;
        if (editor.pointerHit) {
          const cell = {
            x: editor.pointerHit.x,
            y: editor.pointerHit.y,
            z: editor.pointerHit.z,
          };
          const entity = Game.systems.getEditorBlockEntityAt(
            editor,
            cell.x,
            cell.y,
            cell.z
          );
          editor.selectedCell = entity ? cell : null;
          editor.selectedEntity = entity || null;
        } else {
          editor.selectedCell = null;
          editor.selectedEntity = null;
        }
      }
    }

    if (editor.pointerHeld && editor.selectedEntity) {
      const dx = mouseX - editor.pointerStart.x;
      const dy = mouseY - editor.pointerStart.y;
      const moved = Math.hypot(dx, dy);
      if (!editor.dragActive && moved > (editor.dragThreshold ?? 6)) {
        editor.dragActive = true;
        editor.dragEntity = editor.selectedEntity;
        editor.dragCell = { ...editor.selectedCell };
        editor.dragPlaneY = editor.dragCell.y + 0.5;
      }

      if (editor.dragActive) {
        const dragRay = Game.systems.getCameraRayFromScreen(
          worldRef,
          mouseX,
          mouseY
        );
        if (dragRay) {
          const planePoint = Game.systems.intersectRayPlaneY(
            dragRay,
            editor.dragPlaneY ?? 0
          );
          if (planePoint && editor.dragCell) {
            const targetCell = {
              x: Math.floor(planePoint.x),
              y: editor.dragCell.y,
              z: Math.floor(planePoint.z),
            };
            if (
              Game.systems.moveEditorBlock(
                worldRef,
                editor,
                editor.dragEntity,
                targetCell
              )
            ) {
              editor.dragCell = targetCell;
              editor.selectedCell = { ...targetCell };
              editor.hoveredBlock = targetCell;
            }
          }
        }
      }
    }
  }
};

Game.systems.drawEditorHover = function drawEditorHover(worldRef) {
  const editor = worldRef?.resources?.editor;
  const hovered = editor?.hoveredBlock;
  if (!editor || !editor.enabled || !hovered) {
    return;
  }

  const size = Game.config.gridSize;
  const center = {
    x: hovered.x + 0.5,
    y: hovered.y + 0.5,
    z: hovered.z + 0.5,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const color = editor.hoverColor || [255, 200, 120];
  const thickness = editor.hoverThickness ?? 2;
  const scale = editor.hoverScale ?? 1.02;

  resetShader();
  blendMode(BLEND);
  noLights();

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noFill();
  stroke(color[0], color[1], color[2]);
  strokeWeight(thickness);
  box(size * scale, size * scale, size * scale);
  pop();
};

Game.systems.drawEditorSelection = function drawEditorSelection(worldRef) {
  const editor = worldRef?.resources?.editor;
  const selected = editor?.selectedCell;
  if (!editor || !editor.enabled || !selected) {
    return;
  }
  const size = Game.config.gridSize;
  const center = {
    x: selected.x + 0.5,
    y: selected.y + 0.5,
    z: selected.z + 0.5,
  };
  const worldPos = Game.utils.gameToWorld(center);
  const color = editor.selectedColor || [120, 220, 255];
  const thickness = editor.selectedThickness ?? 3;
  const scale = editor.selectedScale ?? 1.08;

  resetShader();
  blendMode(BLEND);
  noLights();

  push();
  translate(worldPos.x, worldPos.y, worldPos.z);
  noFill();
  stroke(color[0], color[1], color[2]);
  strokeWeight(thickness);
  box(size * scale, size * scale, size * scale);
  pop();
};
