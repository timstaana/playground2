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

const BLOCK_VERT = `
precision mediump float;
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
varying float vViewDepth;
varying vec3 vNormal;
void main() {
  vec4 viewPos = uModelViewMatrix * vec4(aPosition, 1.0);
  vViewDepth = -viewPos.z;
  vNormal = aNormal;
  gl_Position = uProjectionMatrix * viewPos;
}
`;

const BLOCK_FRAG = `
precision mediump float;
uniform vec3 uColor;
uniform float uCutEnabled;
uniform float uCutDepth;
uniform float uCutFade;
uniform float uCutNormalY;
uniform float uDitherScale;
varying float vViewDepth;
varying vec3 vNormal;

float bayer2(float x, float y) {
  return x * (1.0 - y) * 2.0 + (1.0 - x) * y * 3.0 + x * y * 1.0;
}

float dither4x4(vec2 fragCoord, float scale) {
  float safeScale = max(scale, 1.0);
  vec2 coord = mod(floor(fragCoord / safeScale), 4.0);
  float x = coord.x;
  float y = coord.y;
  float x0 = mod(x, 2.0);
  float y0 = mod(y, 2.0);
  float x1 = floor(x * 0.5);
  float y1 = floor(y * 0.5);
  float v = 4.0 * bayer2(x0, y0) + bayer2(x1, y1);
  return v / 16.0;
}

void main() {
  if (uCutEnabled > 0.5 && abs(vNormal.y) < uCutNormalY) {
    float d = uCutDepth - vViewDepth;
    if (d > 0.0) {
      float fade = uCutFade > 0.0001 ? clamp(d / uCutFade, 0.0, 1.0) : 1.0;
      float threshold = dither4x4(gl_FragCoord.xy, uDitherScale);
      if (fade > threshold) {
        discard;
      }
    }
  }
  gl_FragColor = vec4(uColor, 1.0);
}
`;


Game.rendering.createSpriteShader = function createSpriteShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(SPRITE_VERT, SPRITE_FRAG);
};

Game.rendering.createBlockShader = function createBlockShader() {
  if (typeof createShader !== "function") {
    return null;
  }
  return createShader(BLOCK_VERT, BLOCK_FRAG);
};
