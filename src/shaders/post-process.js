import {floatPack} from './glsl-pack';

export const postProcessShader = {
    vertexShader: `
precision highp float;
attribute vec2 aPos;
attribute vec2 aUV;
varying vec2 vUV;
void main (void) {
    gl_Position = vec4(aPos, 1.0, 1.0);
    vUV = aUV;
}`,
    fragmentShader: `
precision highp float;
${floatPack}
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uGroup;
uniform sampler2D uIndex;
uniform float uAlpha;
uniform vec2 uRes;
varying vec2 vUV;

#define TAU 6.283185307179586
#define SSAO_SAMPLES 100
#define SSAO_RADIUS 20.0

float rng(inout vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233)))*43758.5453123);
}

float ssao(vec2 p, vec2 uvStep) {
    float z = unpack_f(texture2D(uDepth, vUV));
    float total = 0.0;
    vec2 st = p;
    float rcone = 50.0 * max(uvStep.x, uvStep.y);
    for (int i = -50; i <= 50; i += 5) {
        for (int j = -50; j <= 50; j += 5) {
            vec2 delta = vec2(float(i), float(j));
            float dr = length(delta);
            float sz = unpack_f(texture2D(uDepth, p + delta * uvStep));

            if (dr < 50.0 && z > sz + rcone + dr/1e3) {
                total += 1.0;
            }
        }
    }
    return total * .002;
}

void main (void) {
    vec2 uvStep = 1.0/uRes;
    vec4 color = texture2D(uColor, vUV);
    float group = unpack_i(texture2D(uGroup, vUV));
    float index = unpack_i(texture2D(uIndex, vUV));
    float shadow = clamp(1.0 - ssao(vUV, uvStep), 0.3, 1.0);
    float z = unpack_f(texture2D(uDepth, vUV));
    //color.xyz = vec3(z);
    //color.xyz *= cos((vUV.x * uRes.x + 0.5) * TAU / 2.0);
    //color.xyz *= cos((vUV.y * uRes.y + 0.5) * TAU / 2.0);
    color.xyz *= shadow;
    //color.x = z;
    //color.a *= uAlpha;
    gl_FragColor = color;
}`,
    uniforms: {
        'uColor': 'uniform1i',
        'uDepth': 'uniform1i',
        'uGroup': 'uniform1i',
        'uIndex': 'uniform1i',
        'uRes': 'uniform2fv'
    },
};
