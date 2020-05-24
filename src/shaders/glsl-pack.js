export const floatPack = `
const vec4 bitSh = vec4(256. * 256. * 256., 256. * 256., 256., 1.);
const vec4 bitMsk = vec4(0.,vec3(1./256.0));
const vec4 bitShifts = vec4(1.) / bitSh;

vec4 pack_f (float value) {
    vec4 comp = fract(value * bitSh);
    comp -= comp.xxyz * bitMsk;
    return comp;
}

float unpack_f (vec4 color) {
    return dot(color, bitShifts);
}

vec4 pack_i (float value) {
    return floor(mod(vec4(value / bitSh), 256.0)) / 255.0;
}

float unpack_i (vec4 color) {
    return dot(color * 255.0, bitSh);
}
`;
