name= 'icosphere-subdivided-ascii.stl'
with open(name, 'r') as fd:
    lines = fd.read().splitlines()

vertd = {}
verts = []
indexes = []
itmp = []
idx = 0

def cross(a,b):
    return [
        a[1]*b[2]-a[2]*b[1],
        a[2]*b[0]-a[0]*b[2],
        a[0]*b[1]-a[1]*b[0],
    ]
def sub(a,b):
    return [a-b for a,b in zip(a,b)]
def dot(a,b):
    return sum(a*b for a,b in zip(a,b))
def aligned(coords):
    a,b,c=coords
    return dot(a,cross(sub(b,a),sub(c,a))) < 0

for line in lines:
    if not line.startswith('vertex'):
        continue
    coord = line.split(' ')[1:]

    if line not in vertd:
        # verts.append(coord)
        verts += [float(c) for c in coord]
        vertd[line] = idx
        idx += 1
    itmp.append(vertd[line])
    if len(itmp) == 3:
        if not aligned([verts[i*3:i*3+3] for i in itmp]):
            print('not aligned!')
            itmp[0],itmp[1] = itmp[1],itmp[0]
        # indexes.append(itmp)
        indexes += itmp
        itmp = []
def short(f):
    f = '{:.2f}'.format(f)
    f = f.strip('0')
    f = f.rstrip('.')
    f = f.replace('0.', '.')
    if f == '': f = '0'
    return f
print(','.join(str(short(x)) for x in verts))
print(','.join(map(str, indexes)))
