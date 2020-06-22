import {Matrix4} from './matrix';
import {Lines} from './iter';
export class ShadowConfig {
    /// fractional shadowing around each atom, larger=darker
    /// (0.0-1.0, typically 0.0023)
    pcone = 0.0023;
    /// angle of shadowing around each atom. larger=tighter region
    /// (0.0-1.0, typically 2.0)
    cone_angle = 2.0;
    /// shadowing only applied if z-difference greater than this value.
    /// (Angstroms, typically 1.0)
    rcone = 1.0;
    /// maximal shadowing amount smaller=darker
    /// (0.0-1.0, typically 0.7)
    pshadowmax = 0.7;
}

export class WorldConfig {
    /// Background color, RGB
    background_color = [1, 1, 1];
    /// Fog color, RGB
    fog_color = [1, 1, 1];
    /// fractional transparency of fog at front of molecule
    pfog_high = 0.0;
    /// fractional transparency of fog at back of molecule
    pfog_low = 0.0;
    /// Soft shadow parameters
    shadow = null;
    /// Image size, if negative, will be determined automatically
    /// interpreting negative values as requested padding
    size = [0, 0];
}

export class IllustrateConfig {
    /// Thresholds for gray to black. Typically values from about 3.0-20.0,
    /// Best values for typical atomic illustrations: 3.0, 10.
    contour_outlines = [3, 10];
    /// Kernel for derivative calculation, smoothest = Kernel5x5
    kernel = '';
    /// Range of z-difference used for derivative (Angstroms).
    /// 0.0,1.0 gives outlines around every atom
    /// 0.0,1000.0 gives only outline around molecule
    /// 0.0,5.0 is typical
    zdiff_range = [0, 5];
    /// Thresholds for gray to black (typically ~ 3.0-20.0)
    subunit_outlines = [3, 20];
    /// Thresholds for gray to black (typically ~ 3.0-20.0)
    residue_outlines = [3, 20];
    /// Difference in residue numbers to draw outlines
    residue_diff = 6000;
}

export class Config {
    groups = [];
    file = '';
    output = '';
    center = 'auto';
    translate = [0, 0, 0];
    rotation = Matrix4.unit();
    shadow = null;
    world = new WorldConfig();
    illustrate = new IllustrateConfig();
}

const readLineOrErr = (lines, err) => {
    const line = lines.next();
    if (line) {
        return line.some;
    } else {
        throw new Error('Unexpected end of input at: ' + err);
    }
};

const parseRead = (lines) => {
    const file = readLineOrErr(lines, 'read');
    const groups = [];
    let line;
    while ((line = readLineOrErr(lines, 'read')) != 'END') {
        groups.push(line);
    }
    return {file, groups};
};

const parseNumbers = (str) => {
    return str.split(/\s*,\s*/).map((x) => {
        x = x.trim();
        const number = Number(x);
        if (isNaN(x)) { throw new Error('Not a number:' + x); }
        return number;
    });
};

const readNumbers = (lines, count, err) => {
    const result = [];
    while (count > 0) {
        let line = readLineOrErr(lines, err);
        line = line.replace(/[#!].*$/);
        const numbers = parseNumbers(line);
        for (let i = 0; i < numbers.length; i++) {
            result.push(numbers[i]);
        }
        count -= numbers.length;
    }
    return result;
};

const rotMap = {
    xrot: 'rotX',
    yrot: 'rotY',
    zrot: 'rotZ',
}

export const parseInp = (text) => {
    const config = new Config();
    const lines = new Lines(text);
    let line;
    while ((line = lines.next())) {
        line = line.some;
        switch (line) {
            case 'read': {
                Object.assign(config, parseRead(lines));
            } break;
            case 'center': {
                config.center = readLineOrErr(lines, 'center');
            } break;
            case 'trans': {
                config.translate = readNumbers(lines, 3, 'trans');
            } break;
            case 'scale': {
                config.scale = readNumbers(lines, 1, 'trans')[0];
            } break;
            case 'xrot':
            case 'yrot': 
            case 'zrot': {
                const angle = readNumbers(lines, 1, 'trans');
                const matrixFn = rotMap[line];
                const rotation = Matrix4[matrixFn](angle);
                config.rotation = config.rotation.mul(rotation);
            } break;
            case 'wor': {
                const numbers = readNumbers(lines, 15, 'wor');
                const world = config.world;
                world.background_color = numbers.slice(0, 3);
                world.fog_color = numbers.slice(3, 6);
                world.pfog_high = numbers[6];
                world.pfog_low = numbers[7];
                if (numbers[8]) {
                    const shadow = new ShadowConfig();
                    shadow.pcone = numbers[9];
                    shadow.cone_angle = numbers[10];
                    shadow.rcone = numbers[11];
                    shadow.pshadowmax = numbers[12];
                    world.shadow = shadow;
                }
                world.size = numbers.slice(13, 15);
            } break;
            case 'illustrate': {
                const numbers = readNumbers(lines, 10, 'wor');
                const illu = config.illustrate;
                illu.contour_outlines = numbers.slice(0, 2);
                illu.kernel = numbers[2];
                illu.zdiff_range = numbers.slice(3, 5);
                illu.subunit_outlines = numbers.slice(5, 7);
                illu.residue_outlines = numbers.slice(7, 9);
                illu.residue_diff = numbers[9];
            } break;
            case 'calculate': {
                config.output = readLineOrErr(lines, 'calculate');
            } break;
            default:
                throw new Error('Unknown keyword: ' + line);
        }
    }
    console.log(config);
    return config;
};
