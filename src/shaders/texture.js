import vertexShader from './texture.vert.glsl';
import fragmentShader from './texture.frag.glsl';

export const textureShader = {
    vertexShader,
    fragmentShader,
    uniforms: {
        'uTexture': 'uniform1i',
        'uSize': 'uniform1f',
        'uAlpha': 'uniform1f',
    },
};
