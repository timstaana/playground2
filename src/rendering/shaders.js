window.Game = window.Game || {};
Game.rendering = Game.rendering || {};

const SPRITE_VERT = `
precision mediump float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying vec2 vTexCoord;
void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
}
`;

const SPRITE_FRAG = `
precision mediump float;
uniform sampler2D uTexture;
uniform float uAlphaCutoff;
uniform vec2 uTextureSize;
uniform vec3 uOutlineColor;
uniform float uOutlineThickness;
uniform float uEnableOutline;
uniform float uOutlineOnly;
varying vec2 vTexCoord;
void main() {
  vec4 texColor = texture2D(uTexture, vTexCoord);
  float alpha = texColor.a;
  if (uEnableOutline > 0.5) {
    vec2 texel = uOutlineThickness / max(uTextureSize, vec2(1.0));
    float neighbor = 0.0;
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, 0.0)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, 0.0)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(0.0, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(0.0, -texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(texel.x, -texel.y)).a);
    neighbor = max(neighbor, texture2D(uTexture, vTexCoord + vec2(-texel.x, -texel.y)).a);
    float edge = step(uAlphaCutoff, neighbor) * (1.0 - step(uAlphaCutoff, alpha));
    float border = 0.0;
    border += step(vTexCoord.x, texel.x);
    border += step(1.0 - texel.x, vTexCoord.x);
    border += step(vTexCoord.y, texel.y);
    border += step(1.0 - texel.y, vTexCoord.y);
    border = clamp(border, 0.0, 1.0) * step(uAlphaCutoff, alpha);
    if (uOutlineOnly > 0.5) {
      if (edge > 0.0 || border > 0.0) {
        gl_FragColor = vec4(uOutlineColor, 1.0);
        return;
      }
      discard;
    } else {
      if (edge > 0.0 || border > 0.0) {
        gl_FragColor = vec4(uOutlineColor, 1.0);
        return;
      }
    }
  }
  if (alpha < uAlphaCutoff) {
    discard;
  }
  gl_FragColor = vec4(texColor.rgb, 1.0);
}
`;

Game.rendering.createSpriteShader = function createSpriteShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(SPRITE_VERT, SPRITE_FRAG);
};
