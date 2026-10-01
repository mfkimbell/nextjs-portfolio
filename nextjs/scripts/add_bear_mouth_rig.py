"""Add a real mouth skeleton to the bear GLBs - jaw + lips + corners - without
round-tripping the rig through Blender's exporter.

Run (after add_bear_mouth_morphs.py):

    python3 scripts/add_bear_mouth_rig.py [glb ...]

Defaults to public/wildpoly/bear_sit_fixed.glb (the bake source) plus every
existing bear_sit_<bearId>.glb. bake_bear_pose.py deep-copies the source, so
later bakes keep the rig.

Rig (authored + weight-painted + test-posed in Blender:
scripts/bear-mouth/bear_mouth_shapes.blend, exported to bear_mouth_rig.json):

    head
     |- jaw            pivot at the back of the lower jaw (TMJ-ish hinge)
     |   `- lip_lower  the lower lip / tongue flap, pivot at its back edge
     |- lip_upper      upper lip
     |- lip_corner_L   mouth corners
     `- lip_corner_R

Weighting follows standard face-rig practice (e.g. Kangaroo Builder's mouth
module): lower lip 100% jaw (lip_lower is the jaw's child), mouth corners
~50% jaw (split between lip_lower and a head-parented corner bone), upper lip
0% jaw (its own bone + head), cheek skin near the corners follows the corner
bones with a falloff, chin/lower-muzzle skin rotates with the jaw fading into
cheeks and throat. Max 4 influences per vertex (glTF).

Also retires the original `mouth` bone: sit_log holds it ~9.3 degrees past its
bind rotation (0.162 vs 0.081 quaternion x), which is what kept the lower lip
prised open at rest. Its weights move to lip_lower (the flap) / head (the few
tiny 0.007 influences elsewhere), so the mouth now rests sealed and only
opens when the jaw is driven.

New bones: identity rotation relative to their parent (so their local X is the
head's FACE_RIGHT axis - rotate +X to open), translation = pivot expressed in
the parent's bind frame, IBM = inverse(L) * IBM_parent. They have no animation
channels; the scene drives them every frame.
"""

import json
import os
import struct
import sys
import glob

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RIG = os.path.join(REPO, "scripts", "bear-mouth", "bear_mouth_rig.json")
WILD = os.path.join(REPO, "public", "wildpoly")
MESH_NAME = "Bear_Grizzly_B.001"
sys.path.insert(0, os.path.join(REPO, "scripts"))
sys.dont_write_bytecode = True
from add_bear_mouth_morphs import read_glb, write_glb  # noqa: E402


def mat_from_cols(c):          # glTF column-major 16 -> row-major 4x4
    return [[c[col * 4 + row] for col in range(4)] for row in range(4)]


def cols_from_mat(m):
    return [m[row][col] for col in range(4) for row in range(4)]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def inv(m):
    # general 4x4 inverse (Gauss-Jordan)
    a = [row[:] + [1.0 if i == j else 0.0 for j in range(4)] for i, row in enumerate(m)]
    for c in range(4):
        p = max(range(c, 4), key=lambda r: abs(a[r][c]))
        a[c], a[p] = a[p], a[c]
        pv = a[c][c]
        a[c] = [v / pv for v in a[c]]
        for r in range(4):
            if r != c:
                f = a[r][c]
                a[r] = [vr - f * vc for vr, vc in zip(a[r], a[c])]
    return [row[4:] for row in a]


def xform_point(m, p):
    return [sum(m[i][k] * (p[k] if k < 3 else 1.0) for k in range(4)) for i in range(3)]


def translation(t):
    return [[1, 0, 0, t[0]], [0, 1, 0, t[1]], [0, 0, 1, t[2]], [0, 0, 0, 1]]


def acc_data(j, bin_data, idx):
    a = j["accessors"][idx]
    bv = j["bufferViews"][a["bufferView"]]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
    fmt, size = {5126: ("f", 4), 5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4)}[a["componentType"]]
    stride = bv.get("byteStride", n * size)
    return [list(struct.unpack_from("<%d%s" % (n, fmt), bin_data, base + i * stride)) for i in range(a["count"])]


def append_acc(j, bin_data, rows, ctype, typ, minmax=False):
    fmt, size = {5126: ("f", 4), 5123: ("H", 2)}[ctype]
    bin_data.extend(b"\x00" * ((-len(bin_data)) % 4))
    off = len(bin_data)
    for r in rows:
        bin_data.extend(struct.pack("<%d%s" % (len(r), fmt), *r))
    j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(bin_data) - off})
    j["buffers"][0]["byteLength"] = len(bin_data)
    acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": ctype, "count": len(rows), "type": typ}
    if minmax:
        acc["min"] = [min(r[k] for r in rows) for k in range(len(rows[0]))]
        acc["max"] = [max(r[k] for r in rows) for k in range(len(rows[0]))]
    j["accessors"].append(acc)
    return len(j["accessors"]) - 1


def patch(path, rig):
    j, bin_data = read_glb(path)
    nodes = j["nodes"]
    skins = j.get("skins", [])
    if len(skins) != 1:
        raise RuntimeError(f"{path}: expected exactly one skin, found {len(skins)}")
    skin = skins[0]
    name_to_node = {n.get("name"): i for i, n in enumerate(nodes)}
    missing = [name for name in ["head", "mouth"] if name not in name_to_node]
    if missing:
        raise RuntimeError(f"{path}: missing required facial nodes: {', '.join(missing)}")
    ibm_rows = acc_data(j, bin_data, skin["inverseBindMatrices"])
    joints = list(skin["joints"])
    ibm = {nodes[jn]["name"]: mat_from_cols(ibm_rows[k]) for k, jn in enumerate(joints)}

    for bone in rig["order"]:
        spec = rig["pivots"][bone]
        parent = spec["parent"]
        p_ibm = ibm[parent]
        t = xform_point(p_ibm, spec["pos"])          # pivot in the parent's bind frame
        bone_ibm = matmul(inv(translation(t)), p_ibm)
        if bone in name_to_node:                     # re-run: update in place
            ni = name_to_node[bone]
            nodes[ni]["translation"] = t
        else:
            ni = len(nodes)
            nodes.append({"name": bone, "translation": t})
            name_to_node[bone] = ni
            nodes[name_to_node[parent]].setdefault("children", []).append(ni)
        ibm[bone] = bone_ibm
        if ni not in joints:
            joints.append(ni)
    skin["joints"] = joints
    new_ibm_rows = [cols_from_mat(ibm[nodes[jn]["name"]]) for jn in joints]
    skin["inverseBindMatrices"] = append_acc(j, bin_data, new_ibm_rows, 5126, "MAT4")

    joint_index = {nodes[jn]["name"]: k for k, jn in enumerate(joints)}
    meshes = [m for m in j.get("meshes", []) if m.get("name") == MESH_NAME]
    if len(meshes) != 1 or len(meshes[0].get("primitives", [])) != 1:
        raise RuntimeError(f"{path}: expected one-primitive mesh named {MESH_NAME}")
    prim = meshes[0]["primitives"][0]
    J = acc_data(j, bin_data, prim["attributes"]["JOINTS_0"])
    W = acc_data(j, bin_data, prim["attributes"]["WEIGHTS_0"])
    mouth_j = joint_index["mouth"]
    head_j = joint_index["head"]
    plan = {int(k): v for k, v in rig["weights"].items()}
    if plan and max(plan) >= len(J):
        raise RuntimeError(f"{path}: mouth weight plan references vertex {max(plan)} but mesh has {len(J)} vertices")
    remapped = 0
    for vi in range(len(J)):
        if vi in plan:
            pairs = [(joint_index[n], w) for n, w in plan[vi]]
        else:
            acc = {}
            for jj, w in zip(J[vi], W[vi]):
                if w <= 0:
                    continue
                if jj == mouth_j:
                    jj = head_j
                    remapped += 1
                acc[jj] = acc.get(jj, 0.0) + w
            pairs = sorted(acc.items(), key=lambda kv: -kv[1])
        pairs = pairs[:4]
        s = sum(w for _, w in pairs) or 1.0
        pairs = [(jj, w / s) for jj, w in pairs] + [(0, 0.0)] * (4 - len(pairs))
        J[vi] = [jj for jj, _ in pairs]
        W[vi] = [w for _, w in pairs]
    prim["attributes"]["JOINTS_0"] = append_acc(j, bin_data, J, 5123, "VEC4")
    prim["attributes"]["WEIGHTS_0"] = append_acc(j, bin_data, W, 5126, "VEC4")
    write_glb(path, j, bin_data)
    return len(joints), len(plan), remapped


def main():
    rig = json.load(open(RIG))
    targets = sys.argv[1:] or [os.path.join(WILD, "bear_sit_fixed.glb")] + sorted(
        p for p in glob.glob(os.path.join(WILD, "bear_sit_*.glb")) if not p.endswith("bear_sit_fixed.glb"))
    for p in targets:
        nj, nplan, remapped = patch(p, rig)
        print(f"rigged {os.path.relpath(p, REPO)}: {nj} joints, {nplan} mouth verts reweighted, {remapped} stray mouth influences -> head")


if __name__ == "__main__":
    main()
