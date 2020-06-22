import vertexShader from './initial.vert.glsl';
import colorFrag from './color.frag.glsl';
import layersFrag from './layers.frag.glsl';

const uniforms = {
    'uTime': 'uniform1f',
    'uViewMatrix': 'uniformMatrix4fv',
};

export const colorShader = {
    vertexShader,
    fragmentShader: colorFrag,
    uniforms,
};

export const layersShader = {
    vertexShader,
    fragmentShader: layersFrag,
    uniforms,
};