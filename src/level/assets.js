window.Game = window.Game || {};
Game.assets = Game.assets || {};

Game.assets.loadImageAsync = function loadImageAsync(path) {
  if (typeof loadImage !== "function") {
    return Promise.reject(new Error("loadImage is not available"));
  }
  return Promise.resolve(loadImage(path));
};

Game.assets.loadFontAsync = function loadFontAsync(path) {
  if (typeof loadFont !== "function") {
    return Promise.reject(new Error("loadFont is not available"));
  }
  return Promise.resolve(loadFont(path));
};

Game.assets.loadSpriteTexture = async function loadSpriteTexture(path) {
  const img = await Game.assets.loadImageAsync(path);
  if (!img || !img.width || !img.height) {
    throw new Error("Invalid image dimensions");
  }
  const gfx = createGraphics(img.width, img.height);
  gfx.pixelDensity(1);
  gfx.clear();
  gfx.image(img, 0, 0, gfx.width, gfx.height);
  return {
    source: img,
    texture: gfx,
    lastFrame: -1,
    staticDrawn: true,
  };
};

Game.assets.loadAssets = async function loadAssets(level) {
  const playerSprite = level.player?.sprite || {};
  const frontPath = playerSprite.front || "assets/player_front.gif";
  const backPath = playerSprite.back || "assets/player_back.gif";
  const uiFontPath = level.uiFont || "assets/opensans.ttf";
  const missing = [];
  const paintings = {};

  let front = null;
  let back = null;
  let font = null;

  try {
    front = await Game.assets.loadSpriteTexture(frontPath);
  } catch (err) {
    console.warn(`Missing sprite: ${frontPath}`, err);
    missing.push(frontPath);
    front = null;
  }

  try {
    back = await Game.assets.loadSpriteTexture(backPath);
  } catch (err) {
    console.warn(`Missing sprite: ${backPath}`, err);
    missing.push(backPath);
    back = null;
  }

  if (front && !Game.rendering.isValidTexture(front.texture)) {
    console.warn(`Sprite is not a valid texture: ${frontPath}`, front);
    missing.push(frontPath);
    front = null;
  }
  if (back && !Game.rendering.isValidTexture(back.texture)) {
    console.warn(`Sprite is not a valid texture: ${backPath}`, back);
    missing.push(backPath);
    back = null;
  }

  try {
    font = await Game.assets.loadFontAsync(uiFontPath);
  } catch (err) {
    console.warn(`Missing font: ${uiFontPath}`, err);
    missing.push(uiFontPath);
    font = null;
  }

  return { front, back, paintings, missing, uiFont: font };
};
