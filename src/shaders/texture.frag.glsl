precision highp float;
uniform sampler2D uTexture;
uniform float uAlpha;
varying vec2 vUV;
void main (void) {
    vec4 color = texture2D(uTexture, vUV);
    color.a *= uAlpha;
    gl_FragColor = color;
}