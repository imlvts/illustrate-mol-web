import vertexShader from './progress.vert.glsl';
import fragmentShader from './progress.frag.glsl';

export const progressShader = {
    vertexShader,
    fragmentShader,
    uniforms: {
        'uColor': 'uniform4fv',
        'uProgress': 'uniform1f',
    },
};
