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

float ssao(vec2 p, vec2 uvStep) {
    float z = unpack_f(texture2D(uDepth, p));
    float total = 0.0;
    vec2 st = p;
    float rcone = 50.0 * max(uvStep.x, uvStep.y);
    for (int i = -50; i <= 50; i += 5) {
        for (int j = -50; j <= 50; j += 5) {
            vec2 delta = vec2(float(i), float(j));
            float dr = length(delta);
            float sz = unpack_f(texture2D(uDepth, p + delta * uvStep));
            total += step(dr, 50.0) * step(sz + rcone + dr / 1e3, z);
        }
    }
    return total * .002;
}

float r_low = 3.0;
float r_high = 10.0;
float g_low = 3.0;
float g_high = 10.0;

float subunit_outline(vec2 p, vec2 uvStep) {
    float g = 0.0;
    float r = 0.0;
    float group = unpack_i(texture2D(uGroup, p));
    float index = unpack_i(texture2D(uIndex, p));
    float residue_diff = 6000.0;
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            vec2 delta = vec2(float(dx), float(dy));
            vec2 target = p + delta * uvStep;
            float sgroup = unpack_i(texture2D(uGroup, target));
            if (group != sgroup) { r+=1.0; }
            //float sindex = unpack_i(texture2D(uIndex, target));
            //g += step(residue_diff, abs(index - sindex));
        }
    }

    return (r - r_low) / (r_high - r_low);
}

float l_low = 3.0;
float l_high = 10.0;

float l_diff_min = 0.0;
float l_diff_max = 5.0;

float subunit_second_outline(vec2 p, vec2 uvStep) {
    // second derivative outlines
    float rl = 0.0;
    float l_opacity = 0.0;
    float l_count = 0.0;
    float z = unpack_f(texture2D(uDepth, p));
    float l = 0.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            vec2 target = p + vec2(float(j), float(i)) * uvStep;
            float sz = unpack_f(texture2D(uDepth, target));
            if (i*i*j*j == 16) { continue; }
            float rd = abs(z - sz) * 40.0;
            if (rd <= l_diff_min) { continue; }
            rd = (rd - l_diff_min) / (l_diff_max - l_diff_min);
            l += min(1.0, rd);
        }
    }
    l = (l - l_low) / (l_high - l_low);
    l = clamp(l, 0.0, 1.0);
    if (l > 0.0) {
        l_count += 1.0;
        l_opacity += l;
    }
    if (l_count >= 6.0) {
        return l_opacity / l_count;
    } else {
        return l;
    }
}

void main (void) {
    vec2 uvStep = 1.0/uRes;
    vec4 color = texture2D(uColor, vUV);
    float group = unpack_i(texture2D(uGroup, vUV));
    float index = unpack_i(texture2D(uIndex, vUV));
    float shadow = clamp(1.0 - ssao(vUV, uvStep), 0.3, 1.0);
    float outline = subunit_outline(vUV, uvStep);
    outline = max(outline, subunit_second_outline(vUV, uvStep));
    float z = unpack_f(texture2D(uDepth, vUV));
    //color.xyz = vec3(z);
    //color.xyz *= cos((vUV.x * uRes.x + 0.5) * TAU / 2.0);
    //color.xyz *= cos((vUV.y * uRes.y + 0.5) * TAU / 2.0);
    color.w = max(outline, color.w);
    outline = clamp(1.0 - outline, 0.0, 1.0);
    color.xyz *= shadow * outline;
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
