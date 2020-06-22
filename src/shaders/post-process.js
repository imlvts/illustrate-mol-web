import vertexShader from './post-process.vert.glsl';
import fragmentShader from './post-process.frag.glsl';

export const postProcessShader = {
    vertexShader,
    fragmentShader,
    uniforms: {
        'uColor': 'uniform1i',
        'uLayers': 'uniform1i',
        'uDepth': 'uniform1i',
        'uRes': 'uniform2fv'
    },
};
