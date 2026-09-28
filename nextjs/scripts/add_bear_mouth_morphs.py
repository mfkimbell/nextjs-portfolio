"""Inject the Blender-authored mouth shape keys into the bear GLBs as glTF
morph targets - without round-tripping the rig through Blender's exporter.

Run:

    python3 scripts/add_bear_mouth_morphs.py [glb ...]

With no arguments it patches the source rig AND every already-baked bear:
    public/wildpoly/bear_sit_fixed.glb        (source for bake_bear_pose.py)
    public/wildpoly/bear_sit_<bearId>.glb     (existing baked outputs)

Shapes come from scripts/bear-mouth/bear_mouth_shapes.json, exported from
scripts/bear-mouth/bear_mouth_shapes.blend (four shape keys on the bear
mesh: jawOpen - lower jaw hinged down, exposing the red mouth interior;
mouthWide - lips stretched sideways (E/I/S); mouthRound - lips narrowed and
pushed forward (O/U/W); eyeBlink - both eyes squashed shut). The JSON stores the Blender basis
positions too, so this script can prove the vertex order matches the GLB
before writing anything - Blender's glTF importer puts the Y-up conversion
on the object transform, so the mesh-local coords it edits ARE glTF coords.

Why not just export from Blender: the rest of the pipeline (bearPoses.json,
the banjo/rocking-chair runtime poses) is authored against this GLB's exact
glTF bone rest rotations. bake_bear_pose.py documents how a Blender export
drifted those. Patching only the mesh primitive leaves every bone, skin and
animation byte untouched.

Idempotent: re-running replaces the targets instead of stacking them.
bake_bear_pose.py deep-copies the source JSON+BIN, so bears baked after
this has patched bear_sit_fixed.glb inherit the morphs automatically.
"""

import glob
import json
import math
import os
import struct
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHAPES = os.path.join(REPO, "scripts", "bear-mouth", "bear_mouth_shapes.json")
WILD = os.path.join(REPO, "public", "wildpoly")
NAMES = ["jawOpen", "mouthWide", "mouthRound", "eyeBlink"]
MESH_NAME = "Bear_Grizzly_B.001"


def read_glb(path):
    data = open(path, "rb").read()
    if data[:4] != b"glTF":
        raise RuntimeError(f"not a glb: {path}")
    off = 12
    jl, jt = struct.unpack("<I4s", data[off:off + 8]); off += 8
    j = json.loads(data[off:off + jl]); off += jl
    bin_data = b""
    while off < len(data):
        cl, ct = struct.unpack("<I4s", data[off:off + 8]); off += 8
        if ct == b"BIN\x00":
            bin_data = data[off:off + cl]
        off += cl
    return j, bytearray(bin_data)


def write_glb(path, j, bin_data):
    jb = json.dumps(j, separators=(",", ":")).encode()
    jb += b" " * ((-len(jb)) % 4)
    bb = bytes(bin_data) + b"\x00" * ((-len(bin_data)) % 4)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(path, "wb") as f:
        f.write(b"glTF" + struct.pack("<II", 2, total))
        f.write(struct.pack("<I", len(jb)) + b"JSON" + jb)
        f.write(struct.pack("<I", len(bb)) + b"BIN\x00" + bb)


def read_vec3(j, bin_data, acc_idx):
    acc = j["accessors"][acc_idx]
    bv = j["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride", 12)
    return [struct.unpack_from("<3f", bin_data, base + i * stride) for i in range(acc["count"])]


def append_vec3(j, bin_data, vecs):
    bin_data.extend(b"\x00" * ((-len(bin_data)) % 4))
    off = len(bin_data)
    for v in vecs:
        bin_data.extend(struct.pack("<3f", *v))
    j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(vecs) * 12})
    j["buffers"][0]["byteLength"] = len(bin_data)
    mins = [min(v[k] for v in vecs) for k in range(3)]
    maxs = [max(v[k] for v in vecs) for k in range(3)]
    j["accessors"].append({
        "bufferView": len(j["bufferViews"]) - 1, "componentType": 5126,
        "count": len(vecs), "type": "VEC3", "min": mins, "max": maxs,
    })
    return len(j["accessors"]) - 1


def write_vec3_in_place(j, bin_data, acc_idx, vecs):
    acc = j["accessors"][acc_idx]
    bv = j["bufferViews"][acc["bufferView"]]
    base = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    for i, v in enumerate(vecs):
        struct.pack_into("<3f", bin_data, base + i * 12, *v)
    acc["min"] = [min(v[k] for v in vecs) for k in range(3)]
    acc["max"] = [max(v[k] for v in vecs) for k in range(3)]


def patch(path, shapes):
    j, bin_data = read_glb(path)
    mesh = next((m for m in j["meshes"] if m.get("name") == MESH_NAME), None)
    if mesh is None or len(mesh["primitives"]) != 1:
        raise RuntimeError(f"{path}: expected one-primitive mesh {MESH_NAME}")
    prim = mesh["primitives"][0]
    pos = read_vec3(j, bin_data, prim["attributes"]["POSITION"])
    basis = shapes["basis"]
    if len(pos) != len(basis):
        raise RuntimeError(f"{path}: vertex count {len(pos)} != shapes {len(basis)}")
    worst = max(math.dist(p, b) for p, b in zip(pos, basis))
    if worst > 1e-4:
        raise RuntimeError(f"{path}: vertex order/positions differ from Blender basis (max {worst:.6f})")
    old = prim.get("targets") or []
    if len(old) == len(NAMES) and all(j["accessors"][t["POSITION"]]["count"] == len(pos) for t in old):
        # Re-run: overwrite the existing target data in place rather than
        # appending another copy and orphaning the old bytes. (Always patch the
        # CURRENT file - never a backup - so a rebake done since isn't undone.)
        for t, n in zip(old, NAMES):
            write_vec3_in_place(j, bin_data, t["POSITION"], shapes["targets"][n])
    else:
        prim["targets"] = [{"POSITION": append_vec3(j, bin_data, shapes["targets"][n])} for n in NAMES]
    mesh["weights"] = [0.0] * len(NAMES)

    # Mouth-interior shading as a COLOR_0 multiplier (1 = untouched). Only the
    # 32 vertices that belong exclusively to the red mouth faces are below 1:
    # back of the tongue/throat ~0.16, palate 0.5, floor 0.45, tongue tip
    # 0.8 - so an open jaw reads as a dark maw instead of a red slab. three's
    # GLTFLoader switches material.vertexColors on whenever COLOR_0 exists.
    shade = shapes.get("vertexShade")
    if shade:
        cols = [(v, v, v) for v in shade]
        if "COLOR_0" in prim["attributes"] and j["accessors"][prim["attributes"]["COLOR_0"]]["count"] == len(pos) \
                and j["accessors"][prim["attributes"]["COLOR_0"]]["type"] == "VEC3":
            write_vec3_in_place(j, bin_data, prim["attributes"]["COLOR_0"], cols)
        else:
            prim["attributes"]["COLOR_0"] = append_vec3(j, bin_data, cols)
    extras = mesh.setdefault("extras", {})
    extras["targetNames"] = list(NAMES)   # three's GLTFLoader -> morphTargetDictionary
    write_glb(path, j, bin_data)
    moved = {n: sum(1 for d in shapes["targets"][n] if abs(d[0]) + abs(d[1]) + abs(d[2]) > 1e-6) for n in NAMES}
    moved["shaded"] = sum(1 for v in (shade or []) if v != 1.0)
    return worst, moved


def main():
    shapes = json.load(open(SHAPES))
    targets = sys.argv[1:] or [os.path.join(WILD, "bear_sit_fixed.glb")] + sorted(
        p for p in glob.glob(os.path.join(WILD, "bear_sit_*.glb")) if not p.endswith("bear_sit_fixed.glb"))
    for p in targets:
        worst, moved = patch(p, shapes)
        print(f"patched {os.path.relpath(p, REPO)}  basis match {worst:.2e}  verts moved {moved}")


if __name__ == "__main__":
    main()
