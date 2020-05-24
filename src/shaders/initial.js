import {floatPack} from './glsl-pack';

const sharedVs = `
precision highp float;
attribute vec3 aPos;
attribute vec3 aLocation;
attribute vec3 aColor;
attribute float aRadius;
attribute vec2 aIndex;
attribute vec2 aGroup;
varying vec3 vPos;
varying vec3 vColor;
varying float vIndex;
varying float vGroup;
void main (void) {
    vColor = aColor;
    vIndex = dot(aIndex, vec2(1.0, 65535.0));
    vGroup = dot(aGroup, vec2(1.0, 65535.0));
    gl_Position = vec4(aPos*aRadius+aLocation, 1);
    vPos = gl_Position.xyz;
}`;

export const colorShader = {
    vertexShader: sharedVs,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
void main (void) {
    gl_FragColor = vec4(vColor, 1.0);
}`,
    uniforms: {},
};

export const depthShader = {
    vertexShader: sharedVs,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;

${floatPack}

void main (void) {
    gl_FragColor = pack_f((vPos.z-1.0)/2.0);
}`,
    uniforms: {},
};

export const indexShader = {
    vertexShader: sharedVs,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
varying float vIndex;

${floatPack}

void main (void) {
    gl_FragColor = pack_i(vIndex);
}`,
    uniforms: {},
}

export const groupShader = {
    vertexShader: sharedVs,
    fragmentShader: `
precision highp float;
varying vec3 vPos;
varying vec3 vColor;
varying float vGroup;

${floatPack}

void main (void) {
    gl_FragColor = pack_i(vGroup);
}`,
    uniforms: {},
}
