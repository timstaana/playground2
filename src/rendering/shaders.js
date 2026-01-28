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
varying vec3 vWorldPos;
void main() {
  vec4 viewPos = uModelViewMatrix * vec4(aPosition, 1.0);
  vViewDepth = -viewPos.z;
  vNormal = aNormal;
  vWorldPos = aPosition;
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
#define MAX_SHADOWS 12
uniform float uShadowCount;
uniform vec4 uShadowData[MAX_SHADOWS];
uniform float uShadowStrength;
uniform float uShadowFade;
uniform float uShadowNormalMin;
varying float vViewDepth;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  if (uCutEnabled > 0.5 && abs(vNormal.y) < uCutNormalY) {
    float d = uCutDepth - vViewDepth;
    if (d > 0.0) {
      float cutoff = uCutFade > 0.0001 ? uCutFade * 0.5 : 0.0;
      if (d > cutoff) {
        discard;
      }
    }
  }
  vec3 color = uColor;
  if (uShadowCount > 0.5 && vNormal.y > uShadowNormalMin) {
    float shadow = 0.0;
    for (int i = 0; i < MAX_SHADOWS; i++) {
      if (float(i) >= uShadowCount) {
        break;
      }
      vec4 data = uShadowData[i];
      float radius = data.w;
      float drop = vWorldPos.y - data.y;
      if (drop < 0.0 || drop > uShadowFade) {
        continue;
      }
      vec2 delta = vWorldPos.xz - data.xz;
      float dist = length(delta);
      if (dist > radius) {
        continue;
      }
      float edge = smoothstep(radius * 0.7, radius, dist);
      float heightFade = 1.0 - clamp(drop / uShadowFade, 0.0, 1.0);
      float strength = (1.0 - edge) * heightFade;
      shadow = max(shadow, strength);
    }
    color *= 1.0 - shadow * uShadowStrength;
  }
  gl_FragColor = vec4(color, 1.0);
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
