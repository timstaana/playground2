window.Game = window.Game || {};
Game.rendering = Game.rendering || {};

Game.rendering.isValidTexture = function isValidTexture(tex) {
  if (!tex) {
    return false;
  }
  if (typeof p5 !== "undefined") {
    if (typeof p5.Image === "function" && tex instanceof p5.Image) {
      return !!tex._pInst;
    }
    if (typeof p5.Graphics === "function" && tex instanceof p5.Graphics) {
      return !!tex._pInst;
    }
  }
  return typeof tex === "object" && !!tex._pInst;
};

Game.rendering.clearTexture = function clearTexture() {
  if (typeof noTexture === "function") {
    noTexture();
    return;
  }
  if (typeof texture === "function") {
    try {
      texture(null);
    } catch (err) {
      // Ignore texture clearing failures in p5 v2.
    }
  }
};

Game.rendering.updateSpriteTexture = function updateSpriteTexture(
  spriteTex,
  fps,
  isMoving,
  idleFrame
) {
  const img = spriteTex.source;
  const gfx = spriteTex.texture;
  if (!img || !gfx) {
    return;
  }

  let frame = idleFrame || 0;
  let shouldDraw = true;

  if (typeof img.setFrame === "function") {
    const total =
      typeof img.numFrames === "function" ? img.numFrames() : img.numFrames;
    if (!total || total <= 1) {
      shouldDraw = !spriteTex.staticDrawn;
    } else {
      const clampedIdle = ((idleFrame || 0) % total + total) % total;
      if (!isMoving || !fps || fps <= 0) {
        frame = clampedIdle;
        if (frame === spriteTex.lastFrame && spriteTex.staticDrawn) {
          shouldDraw = false;
        } else {
          img.setFrame(frame);
        }
      } else {
        frame = Math.floor((millis() * fps) / 1000) % total;
        if (frame === spriteTex.lastFrame) {
          shouldDraw = false;
        } else {
          img.setFrame(frame);
        }
      }
    }
  } else {
    shouldDraw = !spriteTex.staticDrawn;
  }

  if (!shouldDraw) {
    return;
  }

  gfx.clear();
  gfx.image(img, 0, 0, gfx.width, gfx.height);
  spriteTex.lastFrame = frame;
  spriteTex.staticDrawn = true;
};
