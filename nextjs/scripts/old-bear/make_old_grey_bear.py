#!/usr/bin/env python3
"""
Build public/wildpoly/bear_old_grey.glb - the old grey bear - from
public/wildpoly/bear_sit_fixed.glb, WITHOUT a Blender round-trip (a re-export
drifts the rig's axes; see scripts/bake_bear_pose.py).

What changes:
  * the fur texture is LEFT AS THE ORIGINAL brown on purpose: the site greys
    it at runtime (src/components/scene-lab/oldBear.ts) so how grey, how
    bright and how pale-faced he is are live lab sliders. Pass --bake-grey to
    swap in scripts/old-bear/bear_old_grey_texture.png instead.
  * four rigid meshes are added as CHILDREN OF THE HEAD / JAW JOINTS, so they
    ride every nod, look and talk the head does:
        OldGlasses      big round tortoiseshell frames, bridge and temples
        OldGlassesLens  the two lenses (alpha-blended)
        OldBrows        bushy, droopy white eyebrows
        OldBeard        a full white beard, cheek fluff and a drooping
                        mustache - on the JAW joint, so it moves with the chin
    Their geometry comes from scripts/old-bear/old_bear_props.json, authored
    in Blender (scripts/onlybears/onlybears_lab.blend) against the posed
    bear and exported in the head joint's own glTF frame.

Everything else - skin, joints, the mouth rig, morph targets, COLOR_0 and
the sit_log clip - is copied through byte for byte.

Usage:  python3 scripts/old-bear/make_old_grey_bear.py
"""
import json, struct, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "public/wildpoly/bear_sit_fixed.glb")
DST = os.path.join(ROOT, "public/wildpoly/bear_old_grey.glb")
TEX = os.path.join(ROOT, "scripts/old-bear/bear_old_grey_texture.png")
PROPS = os.path.join(ROOT, "scripts/old-bear/old_bear_props.json")

MATERIALS = {
    "OldGlasses": {"name": "OldGlassesFrame", "pbrMetallicRoughness": {
        "baseColorFactor": [0.10, 0.055, 0.03, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.35}},
    "OldGlassesLens": {"name": "OldGlassesLens", "alphaMode": "BLEND", "doubleSided": True,
        "pbrMetallicRoughness": {"baseColorFactor": [0.78, 0.9, 0.97, 0.22], "metallicFactor": 0.0, "roughnessFactor": 0.05}},
    "OldBrows": {"name": "OldBrows", "pbrMetallicRoughness": {
        "baseColorFactor": [0.86, 0.85, 0.82, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.9}},
    "OldBeard": {"name": "OldBeard", "pbrMetallicRoughness": {
        "baseColorFactor": [0.80, 0.79, 0.76, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.95}},
}


def read_glb(path):
    b = open(path, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    J = json.loads(b[20:20 + jl])
    bin_off = 20 + jl
    bl = struct.unpack("<I", b[bin_off:bin_off + 4])[0]
    return J, b[bin_off + 8:bin_off + 8 + bl]


def pad4(x, fill=b"\x00"):
    return x + fill * ((4 - len(x) % 4) % 4)


def main():
    J, BIN = read_glb(SRC)
    tex = open(TEX, "rb").read()
    props = json.load(open(PROPS))

    # --- repack every existing bufferView (optionally swapping the texture)
    bake = "--bake-grey" in sys.argv
    img_view = J["images"][0]["bufferView"] if bake else -1
    out = bytearray()
    for i, bv in enumerate(J["bufferViews"]):
        data = tex if i == img_view else BIN[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        while len(out) % 4:
            out += b"\x00"
        bv["byteOffset"] = len(out)
        bv["byteLength"] = len(data)
        out += data
    if bake:
        J["images"][0]["name"] = "bear_old_grey_texture"

    def add_view(data, target=None):
        nonlocal out
        while len(out) % 4:
            out += b"\x00"
        view = {"buffer": 0, "byteOffset": len(out), "byteLength": len(data)}
        if target:
            view["target"] = target
        out += data
        J["bufferViews"].append(view)
        return len(J["bufferViews"]) - 1

    def add_accessor(view, ctype, count, typ, mn=None, mx=None):
        a = {"bufferView": view, "componentType": ctype, "count": count, "type": typ}
        if mn is not None:
            a["min"], a["max"] = mn, mx
        J["accessors"].append(a)
        return len(J["accessors"]) - 1

    # --- the props, each hung off its own joint (head, or jaw for the beard).
    #
    # Every prop node sits at a PIVOT and is ROTATED onto the face's own axes
    # (x = the bear's right, y = up the face, z = out along the snout - the
    # same FACE_* axes the site uses), with its vertices stored in that frame.
    # So the site can scale a prop about its own middle, and scale the beard's
    # width / length / depth separately, just by setting node.scale. The jaw
    # joint carries no rotation of its own (scripts/add_bear_mouth_rig.py), so
    # these axes are the same under head and jaw. The lenses share the frame's
    # pivot so the two always scale together; the beard hangs from its top.
    import math
    R = (1.0, 0.0, 0.0)
    U = (0.0, 0.531, -0.848)
    F = (0.0, 0.848, 0.531)
    nu = math.sqrt(sum(c * c for c in U)); U = tuple(c / nu for c in U)
    nf = math.sqrt(sum(c * c for c in F)); F = tuple(c / nf for c in F)

    def to_face(v):
        return [sum(v[k] * R[k] for k in range(3)), sum(v[k] * U[k] for k in range(3)), sum(v[k] * F[k] for k in range(3))]

    def from_face(v):
        return [R[k] * v[0] + U[k] * v[1] + F[k] * v[2] for k in range(3)]

    # rotation quaternion of the basis matrix [R U F] (columns)
    m00, m01, m02 = R[0], U[0], F[0]
    m10, m11, m12 = R[1], U[1], F[1]
    m20, m21, m22 = R[2], U[2], F[2]
    tr = m00 + m11 + m22
    if tr > 0:
        S4 = math.sqrt(tr + 1.0) * 2
        quat = [(m21 - m12) / S4, (m02 - m20) / S4, (m10 - m01) / S4, 0.25 * S4]
    else:
        S4 = math.sqrt(1.0 + m00 - m11 - m22) * 2
        quat = [0.25 * S4, (m01 + m10) / S4, (m02 + m20) / S4, (m21 - m12) / S4]

    def centroid(pts):
        return [sum(p[k] for p in pts) / len(pts) for k in range(3)]

    face_pts = {n: [to_face(p) for p in props[n]["positions"]] for n in props}
    pivots = {
        "OldGlasses": centroid(face_pts["OldGlasses"]),
        "OldBrows": centroid(face_pts["OldBrows"]),
    }
    bc = centroid(face_pts["OldBeard"])
    pivots["OldBeard"] = [bc[0], max(p[1] for p in face_pts["OldBeard"]), bc[2]]
    pivots["OldGlassesLens"] = pivots["OldGlasses"]
    for name in ("OldGlasses", "OldGlassesLens", "OldBrows", "OldBeard"):
        P = props[name]
        head = next(i for i, n in enumerate(J["nodes"]) if n.get("name") == P.get("joint", "head"))
        pv0 = pivots[name]
        pos = [[p[0] - pv0[0], p[1] - pv0[1], p[2] - pv0[2]] for p in face_pts[name]]
        nor = [to_face(n) for n in P["normals"]]
        idx = P["indices"]
        node_t = from_face(pv0)
        pv = add_view(struct.pack("<%df" % (3 * len(pos)), *[c for p in pos for c in p]), 34962)
        nv = add_view(struct.pack("<%df" % (3 * len(nor)), *[c for n in nor for c in n]), 34962)
        big = max(idx) > 65535
        iv = add_view(pad4(struct.pack("<%d%s" % (len(idx), "I" if big else "H"), *idx)), 34963)
        mn = [min(p[k] for p in pos) for k in range(3)]
        mx = [max(p[k] for p in pos) for k in range(3)]
        pa = add_accessor(pv, 5126, len(pos), "VEC3", mn, mx)
        na = add_accessor(nv, 5126, len(nor), "VEC3")
        ia = add_accessor(iv, 5125 if big else 5123, len(idx), "SCALAR")
        J["materials"].append(MATERIALS[name])
        J["meshes"].append({"name": name, "primitives": [{
            "attributes": {"POSITION": pa, "NORMAL": na}, "indices": ia,
            "material": len(J["materials"]) - 1}]})
        J["nodes"].append({"name": name, "mesh": len(J["meshes"]) - 1,
                           "translation": node_t, "rotation": quat})
        J["nodes"][head].setdefault("children", []).append(len(J["nodes"]) - 1)

    J["buffers"] = [{"byteLength": len(out)}]
    js = pad4(json.dumps(J, separators=(",", ":")).encode(), b" ")
    bn = pad4(bytes(out))
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(DST, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bn), 0x004E4942)); f.write(bn)
    print("wrote", DST, total, "bytes")


if __name__ == "__main__":
    main()
