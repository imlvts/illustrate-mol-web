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
uniform sampler2D uColor;
uniform highp sampler2D uLayers;
uniform float uAlpha;
uniform vec2 uRes;
varying vec2 vUV;

#define TAU 6.283185307179586
#define SSAO_SAMPLES 100
#define SSAO_RADIUS 20.0

float ssao(vec2 p, vec2 uvStep) {
    float z = texture2D(uLayers, p).x;
    if (z <= 0.0) {
        return 0.0;
    }
    float total = 0.0;
    vec2 st = p;
    float rcone = 1.0 / 80.0;
    for (int i = -50; i <= 50; i += 5) {
        for (int j = -50; j <= 50; j += 5) {
            vec2 delta = vec2(float(i), float(j));
            float dr = length(delta);
            float sz = texture2D(uLayers, p + delta * uvStep).x;
            total += step(dr, 50.0) * step(z, sz - rcone - dr / 400.0);
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
    vec4 layers = texture2D(uLayers, p);
    float index = layers.y;
    float group = layers.z;
    float residue_diff = 6000.0;
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            vec2 delta = vec2(float(dx), float(dy));
            vec2 target = p + delta * uvStep;
            vec4 layers = texture2D(uLayers, target);
            float sgroup = layers.z;
            if (group != sgroup) { r+=1.0; }
            //float sindex = layers.y;
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
    float z = texture2D(uLayers, p).x;
    if (z <= 0.0) {
        return 0.0;
    }
    float l = 0.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            vec2 target = p + vec2(float(j), float(i)) * uvStep;
            float sz = texture2D(uLayers, target).x;
            if (i*i*j*j == 16) { continue; }
            float rd = abs(sz - z) * 80.0;
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
    float shadow = 1.0;
    shadow *= clamp(1.0 - ssao(vUV, uvStep), 0.3, 1.0);
    float outline = 0.0;
    outline = max(outline, subunit_outline(vUV, uvStep));
    outline = max(outline, subunit_second_outline(vUV, uvStep));
    color.w = max(outline, color.w);
    outline = clamp(1.0 - outline, 0.0, 1.0);
    color.xyz *= shadow * outline;
    gl_FragColor = color;
}`,
    uniforms: {
        'uColor': 'uniform1i',
        'uLayers': 'uniform1i',
        'uDepth': 'uniform1i',
        'uRes': 'uniform2fv'
    },
};
