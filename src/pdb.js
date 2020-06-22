const xhr = function (url, progress) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.onprogress = progress;
        request.onload = function() {
            if (request.status >= 400) {
                return reject(`Error loading file - ${request.status} ${request.statusText}`);
            }
            resolve(request.response);
        };
        request.send();
    });
};

const parseAtom = function(str) {
    const kind = str.substr(0, 6).trim();
    const descriptor = str.substring(12, 22);
    const index = Number(str.substring(22, 26).trim());
    const chain = str.substring(21, 22);
    const [x, y ,z] = str.substr(29, 54).trim().split(/\s+/)
        .map((x) => Number(x));
    return {kind, descriptor, index, chain, pos: {x, y, z}};
};

export const findAtomGroup = (groups, atom) => {
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const matches =
            group.kind === atom.kind &&
            group.descriptor.exec(atom.descriptor) &&
            group.index.low <= atom.index &&
            group.index.high >= atom.index;
        if (matches) {
            return group;
        }
    }
};

export const parsePdb = (data) => {
    const atoms = [];
    const re = /^(ATOM|HETATM).*$/gm;
    let row;
    while ((row = re.exec(data))) {
        atoms.push(parseAtom(row[0]));
    }
    return {atoms};
};

export const loadPdb = async (url, progress) =>
    parsePdb(await xhr(url, progress));
