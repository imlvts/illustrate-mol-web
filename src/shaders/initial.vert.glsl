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
uniform float uTime;
uniform mat4 uViewMatrix;

void main (void) {
    float rate = 1e-4;
    float sa = sin(uTime * rate);
    float ca = cos(uTime * rate);
    vColor = aColor;
    vIndex = dot(aIndex, vec2(1.0, 65536.0));
    vGroup = dot(aGroup, vec2(1.0, 65536.0));
    vec3 loc = aLocation * vec3(1.0, 1.0, -1.0);
    gl_Position = uViewMatrix * vec4((aPos*aRadius+loc), 1);
    vPos = gl_Position.xyz;
}