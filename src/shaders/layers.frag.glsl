precision highp float;
varying vec3 vPos;
varying vec3 vColor;
varying float vIndex;
varying float vGroup;

void main (void) {
    gl_FragColor = vec4(
       (1.0 - vPos.z)/2.0,
       vIndex,
       vGroup,
       1.0
    );
}