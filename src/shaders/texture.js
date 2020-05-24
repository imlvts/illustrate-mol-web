export const textureShader = {
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
uniform sampler2D uTexture;
uniform float uAlpha;
varying vec2 vUV;
void main (void) {
    vec4 color = texture2D(uTexture, vUV);
    color.a *= uAlpha;
    gl_FragColor = color;
}`,
    uniforms: {
        'uTexture': 'uniform1i',
        'uSize': 'uniform1f',
        'uAlpha': 'uniform1f',
    },
};
