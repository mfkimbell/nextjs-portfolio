#!/usr/bin/env python3
"""
Build left_tree.glb headlessly (no Blender).

Trunk (staggered seams) + tapered branches, matching Poly-by-Google
reference aesthetic (~85% diagonal edges, not stacked rings).

Branches use the industry-standard EXTRUDE-FROM-FACE method
(proctree.js, Blender low-poly workflows): a 3x3 trunk-vertex patch
is located at each branch emergence point, the 4 interior trunk
quads are DELETED (creating a hole), and the hole's 8 boundary
verts become the branch's first ring. Vertices are literally shared
between trunk and branches — no separate meshes, no seams.

Geometry parameters are loaded from
  blender/left_tree_config.json
so the tree can be tuned without touching this script.

Run:
  python3 blender/build_left_tree.py
"""

import os
import math
import random
import json
from typing import List, Tuple

import numpy as np
from pygltflib import (
    GLTF2, Asset, Scene, Node, Mesh, Primitive, Attributes,
    Accessor, BufferView, Buffer, Material, PbrMetallicRoughness,
)

random.seed(12345)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(REPO_ROOT, "blender", "left_tree_config.json")
OUTPUT_PATH = os.path.join(REPO_ROOT, "nextjs", "public", "models", "left_tree.glb")

with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
    CFG = json.load(fh)

# ---------- color helpers ----------
def hex_to_lin(hex_str):
    r = int(hex_str[0:2], 16) / 255
    g = int(hex_str[2:4], 16) / 255
    b = int(hex_str[4:6], 16) / 255
    def s2l(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (s2l(r), s2l(g), s2l(b), 1.0)

BASE = hex_to_lin("aa7c54")
KNOT = hex_to_lin("6b4a2e")

# ---------- trunk parameters from config ----------
TRUNK = CFG["trunk"]
TRUNK_HEIGHT   = float(TRUNK["height"])
TRUNK_R_BASE   = float(TRUNK["radius_base"])
TRUNK_R_TOP    = float(TRUNK["radius_top"])
RADIAL_SEGS    = int(TRUNK["radial_segments"])
HEIGHT_SEGS    = int(TRUNK["height_segments"])
BASE_FLARE_R   = float(TRUNK["base_flare_radius"])
BASE_FLARE_END = float(TRUNK["base_flare_fraction"])
Y_JITTER_FRAC  = float(TRUNK["y_jitter_fraction"])
R_JITTER_FRAC  = float(TRUNK["r_jitter_fraction"])
TWIST_PER_RING = math.pi / RADIAL_SEGS
knots_at       = [tuple(k) for k in TRUNK["knot_ys"]]

# ==== geometry accumulators ====
verts: List[Tuple[float, float, float]] = []
tri_indices: List = []  # each entry: (a, b, c) or None (deleted face)

def add_ring_pair_faces(lower_idx, upper_idx, radial):
    for s in range(radial):
        s2 = (s + 1) % radial
        a = lower_idx[s]; b = lower_idx[s2]; c = upper_idx[s2]; d = upper_idx[s]
        tri_indices.append((a, b, c))
        tri_indices.append((a, c, d))

# ==== TRUNK ====
rings = []
for i in range(HEIGHT_SEGS + 1):
    t = i / HEIGHT_SEGS
    y = t * TRUNK_HEIGHT
    ring_spacing = TRUNK_HEIGHT / HEIGHT_SEGS

    if t < BASE_FLARE_END:
        u = t / BASE_FLARE_END
        eased = (1 - u) ** 3
        r_base = TRUNK_R_BASE + (BASE_FLARE_R - TRUNK_R_BASE) * eased
    else:
        u2 = (t - BASE_FLARE_END) / (1 - BASE_FLARE_END)
        r_base = TRUNK_R_BASE + (TRUNK_R_TOP - TRUNK_R_BASE) * u2

    twist = TWIST_PER_RING * (i % 2)

    ring_idx = []
    for s in range(RADIAL_SEGS):
        theta = twist + (2 * math.pi * s / RADIAL_SEGS)
        rj = 1.0 + (random.random() - 0.5) * 2 * R_JITTER_FRAC
        r = r_base * rj
        x = r * math.cos(theta)
        z = r * math.sin(theta)
        if 0 < i < HEIGHT_SEGS:
            yj = (random.random() - 0.5) * 2 * Y_JITTER_FRAC * ring_spacing
        else:
            yj = 0.0
        ring_idx.append(len(verts))
        verts.append((x, y + yj, z))
    rings.append(ring_idx)

trunk_faces_by_quad = {}
for j in range(HEIGHT_SEGS):
    lower = rings[j]; upper = rings[j + 1]
    for s in range(RADIAL_SEGS):
        s2 = (s + 1) % RADIAL_SEGS
        a = lower[s]; b = lower[s2]; c = upper[s2]; d = upper[s]
        tri0_idx = len(tri_indices); tri_indices.append((a, b, c))
        tri1_idx = len(tri_indices); tri_indices.append((a, c, d))
        trunk_faces_by_quad[(j, s)] = (tri0_idx, tri1_idx)

# bottom cone
bottom_center = len(verts); verts.append((0.0, -0.05, 0.0))
for s in range(RADIAL_SEGS):
    s2 = (s + 1) % RADIAL_SEGS
    tri_indices.append((bottom_center, rings[0][s2], rings[0][s]))

# top: multi-step convergence
top_shrink_stages = 3
prev_ring = rings[-1]
for step in range(1, top_shrink_stages + 1):
    frac = 1.0 - (step / top_shrink_stages)
    y_here = TRUNK_HEIGHT + step * 0.04
    if step == top_shrink_stages:
        tip = len(verts); verts.append((0.0, y_here, 0.0))
        for s in range(RADIAL_SEGS):
            s2 = (s + 1) % RADIAL_SEGS
            tri_indices.append((prev_ring[s], prev_ring[s2], tip))
    else:
        new_ring = []
        twist = TWIST_PER_RING * ((HEIGHT_SEGS + step) % 2)
        for s in range(RADIAL_SEGS):
            theta = twist + (2 * math.pi * s / RADIAL_SEGS)
            r = TRUNK_R_TOP * frac
            x = r * math.cos(theta)
            z = r * math.sin(theta)
            new_ring.append(len(verts))
            verts.append((x, y_here, z))
        add_ring_pair_faces(prev_ring, new_ring, RADIAL_SEGS)
        prev_ring = new_ring

# ==== BRANCHES ====
def vec_norm(v):
    x, y, z = v
    m = math.sqrt(x * x + y * y + z * z)
    return (x / m, y / m, z / m) if m else (0, 0, 0)
def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def scale(a, k): return (a[0] * k, a[1] * k, a[2] * k)

def add_branch(name, t, side, tilt_deg, length, r_base_frac, segments, droop, twist_deg, **_):
    """Extrude-from-face branch. See module docstring."""
    tilt = math.radians(tilt_deg)
    twist = math.radians(twist_deg)
    radial = 8  # forced by 3x3 patch boundary

    y0 = t * TRUNK_HEIGHT

    az = 0.0 if side > 0 else math.pi
    az += twist * (1 if side > 0 else -1)

    dir_out = (math.cos(az), 0, math.sin(az))
    branch_axis = vec_norm(add(scale(dir_out, math.cos(tilt)), scale((0, 1, 0), math.sin(tilt))))

    j_center = round(y0 / TRUNK_HEIGHT * HEIGHT_SEGS)
    j_center = max(1, min(HEIGHT_SEGS - 1, j_center))
    j0 = j_center - 1

    best_s, best_score = 0, -1e9
    for s in range(RADIAL_SEGS):
        vi = rings[j_center][s]
        vx, _, vz = verts[vi]
        hlen = math.sqrt(vx * vx + vz * vz) or 1e-9
        dot = (vx * dir_out[0] + vz * dir_out[2]) / hlen
        if dot > best_score:
            best_score = dot
            best_s = s
    s0 = (best_s - 1) % RADIAL_SEGS

    to_delete_quads = [
        (j0,     s0 % RADIAL_SEGS),
        (j0,     (s0 + 1) % RADIAL_SEGS),
        (j0 + 1, s0 % RADIAL_SEGS),
        (j0 + 1, (s0 + 1) % RADIAL_SEGS),
    ]
    tris_to_delete = set()
    for key in to_delete_quads:
        if key in trunk_faces_by_quad:
            t0, t1 = trunk_faces_by_quad[key]
            tris_to_delete.add(t0); tris_to_delete.add(t1)
            del trunk_faces_by_quad[key]
    for ti in tris_to_delete:
        tri_indices[ti] = None

    ring0 = []
    for (dr, dc) in [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2), (2, 1), (2, 0), (1, 0)]:
        j = j0 + dr
        s = (s0 + dc) % RADIAL_SEGS
        ring0.append(rings[j][s])

    cx0 = sum(verts[vi][0] for vi in ring0) / radial
    cy0 = sum(verts[vi][1] for vi in ring0) / radial
    cz0 = sum(verts[vi][2] for vi in ring0) / radial
    r_base_actual = sum(
        math.sqrt((verts[vi][0] - cx0) ** 2 + (verts[vi][1] - cy0) ** 2 + (verts[vi][2] - cz0) ** 2)
        for vi in ring0
    ) / radial

    perp1 = cross(branch_axis, (0, 1, 0))
    if perp1[0] ** 2 + perp1[1] ** 2 + perp1[2] ** 2 < 1e-8:
        perp1 = cross(branch_axis, (1, 0, 0))
    perp1 = vec_norm(perp1)
    perp2 = vec_norm(cross(branch_axis, perp1))

    seg_len = length / segments

    rings_local = [ring0]
    for i in range(1, segments + 1):
        tt = i / segments
        r_here = r_base_actual * (1 - tt ** 1.35) ** 0.90
        sag = -droop * tt * tt
        cx = cx0 + branch_axis[0] * length * tt
        cy = cy0 + branch_axis[1] * length * tt + sag
        cz = cz0 + branch_axis[2] * length * tt

        ring_twist = math.pi / radial * (i % 2)
        if i == 1:
            ring_twist = 0.0

        ring_idx = []
        for s in range(radial):
            theta = ring_twist + 2 * math.pi * s / radial
            jitter_amt = 0.08 + 0.20 * tt
            rj = 1.0 + (random.random() - 0.5) * 2 * jitter_amt
            rr = r_here * rj
            aj = 0.0 if i == segments else (random.random() - 0.5) * 2 * 0.28 * seg_len
            px = cx + perp1[0] * rr * math.cos(theta) + perp2[0] * rr * math.sin(theta) + branch_axis[0] * aj
            py = cy + perp1[1] * rr * math.cos(theta) + perp2[1] * rr * math.sin(theta) + branch_axis[1] * aj
            pz = cz + perp1[2] * rr * math.cos(theta) + perp2[2] * rr * math.sin(theta) + branch_axis[2] * aj
            ring_idx.append(len(verts))
            verts.append((px, py, pz))
        rings_local.append(ring_idx)

    for i in range(segments):
        add_ring_pair_faces(rings_local[i], rings_local[i + 1], radial)

    last = rings_local[-1]
    cx = sum(verts[v][0] for v in last) / len(last)
    cy = sum(verts[v][1] for v in last) / len(last)
    cz = sum(verts[v][2] for v in last) / len(last)
    tip = (cx + branch_axis[0] * seg_len * 0.6,
           cy + branch_axis[1] * seg_len * 0.6,
           cz + branch_axis[2] * seg_len * 0.6)
    tip_idx = len(verts); verts.append(tip)
    for s in range(radial):
        s2 = (s + 1) % radial
        tri_indices.append((tip_idx, last[s], last[s2]))

for spec in CFG["branches"]:
    # ignore "_comment" and any fields the function doesn't need via **_
    kwargs = {k: v for k, v in spec.items() if not k.startswith("_")}
    add_branch(**kwargs)

# ==== FLATTEN ====
knot_ys = [(spec_t * TRUNK_HEIGHT, spec_side) for (spec_t, spec_side) in knots_at]

positions = []
normals = []
colors = []
indices = []
for tri in tri_indices:
    if tri is None:
        continue
    a, b, c = tri
    p0 = verts[a]; p1 = verts[b]; p2 = verts[c]
    e1 = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    e2 = (p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2])
    nx = e1[1] * e2[2] - e1[2] * e2[1]
    ny = e1[2] * e2[0] - e1[0] * e2[2]
    nz = e1[0] * e2[1] - e1[1] * e2[0]
    L = math.sqrt(nx * nx + ny * ny + nz * nz)
    if L < 1e-9:
        nx, ny, nz = 0, 1, 0
    else:
        nx, ny, nz = nx / L, ny / L, nz / L
    cx = (p0[0] + p1[0] + p2[0]) / 3
    cy = (p0[1] + p1[1] + p2[1]) / 3
    lj = 1.0 + (random.random() - 0.5) * 2 * 0.14
    r, g, b_, _a_ = BASE
    for (ky, kside) in knot_ys:
        if abs(cy - ky) < 0.20:
            side_sign = 1 if kside == 0 else -1
            if (cx * side_sign) > 0.02:
                mix = 1 - (abs(cy - ky) / 0.20)
                r = r * (1 - mix * 0.55) + KNOT[0] * mix * 0.55
                g = g * (1 - mix * 0.55) + KNOT[1] * mix * 0.55
                b_ = b_ * (1 - mix * 0.55) + KNOT[2] * mix * 0.55
                break
    col = (r * lj, g * lj, b_ * lj, 1.0)
    base = len(positions)
    positions.append(p0); positions.append(p1); positions.append(p2)
    normals.append((nx, ny, nz)); normals.append((nx, ny, nz)); normals.append((nx, ny, nz))
    colors.append(col); colors.append(col); colors.append(col)
    indices.extend([base, base + 1, base + 2])

positions = np.array(positions, dtype=np.float32)
normals   = np.array(normals,   dtype=np.float32)
colors    = np.array(colors,    dtype=np.float32)
indices   = np.array(indices,   dtype=np.uint32)

# ==== write GLB ====
pos_bytes = positions.tobytes()
nor_bytes = normals.tobytes()
col_bytes = colors.tobytes()
idx_bytes = indices.tobytes()

blob = b""
def _append(data):
    global blob
    offset = len(blob)
    blob += data
    pad = (4 - (len(blob) % 4)) % 4
    blob += b"\x00" * pad
    return offset, len(data)

pos_off, pos_len = _append(pos_bytes)
nor_off, nor_len = _append(nor_bytes)
col_off, col_len = _append(col_bytes)
idx_off, idx_len = _append(idx_bytes)

gltf = GLTF2(
    asset=Asset(version="2.0", generator="left_tree_headless"),
    scenes=[Scene(nodes=[0])],
    scene=0,
    nodes=[Node(mesh=0, name="LeftTree")],
    meshes=[Mesh(primitives=[Primitive(
        attributes=Attributes(POSITION=0, NORMAL=1, COLOR_0=2),
        indices=3,
        material=0,
        mode=4,
    )])],
    materials=[Material(
        name="TreeMat",
        pbrMetallicRoughness=PbrMetallicRoughness(
            baseColorFactor=[1.0, 1.0, 1.0, 1.0],
            metallicFactor=0.0,
            roughnessFactor=0.95,
        ),
    )],
    buffers=[Buffer(byteLength=len(blob))],
    bufferViews=[
        BufferView(buffer=0, byteOffset=pos_off, byteLength=pos_len, target=34962),
        BufferView(buffer=0, byteOffset=nor_off, byteLength=nor_len, target=34962),
        BufferView(buffer=0, byteOffset=col_off, byteLength=col_len, target=34962),
        BufferView(buffer=0, byteOffset=idx_off, byteLength=idx_len, target=34963),
    ],
    accessors=[
        Accessor(bufferView=0, componentType=5126, count=len(positions), type="VEC3",
                 max=positions.max(0).tolist(), min=positions.min(0).tolist()),
        Accessor(bufferView=1, componentType=5126, count=len(normals),   type="VEC3"),
        Accessor(bufferView=2, componentType=5126, count=len(colors),    type="VEC4"),
        Accessor(bufferView=3, componentType=5125, count=len(indices),   type="SCALAR"),
    ],
)

gltf.set_binary_blob(blob)
gltf.save_binary(OUTPUT_PATH)

print(f"OK  verts={len(positions)}  tris={len(indices)//3}  size={os.path.getsize(OUTPUT_PATH)} bytes")

# ==== sanity check ====
edges = set()
for i in range(0, len(indices), 3):
    a, b, c = int(indices[i]), int(indices[i + 1]), int(indices[i + 2])
    for u, v in ((a, b), (b, c), (c, a)):
        if u > v: u, v = v, u
        edges.add((u, v))
h = v_ = d = 0
for (u, vv) in edges:
    p1 = positions[u]; p2 = positions[vv]
    dz = abs(float(p1[1] - p2[1]))
    dh = math.sqrt(float((p1[0] - p2[0]) ** 2 + (p1[2] - p2[2]) ** 2))
    L = math.sqrt(dh * dh + dz * dz)
    if L < 1e-9: continue
    ang = math.degrees(math.atan2(dz, dh))
    if ang < 5: h += 1
    elif ang > 85: v_ += 1
    else: d += 1
total = h + v_ + d
print(f"edge angles:  horiz={h/total*100:.1f}%  vert={v_/total*100:.1f}%  diag={d/total*100:.1f}%")

# report bounding box (useful when tuning the React frustum)
minv = positions.min(0); maxv = positions.max(0)
print(f"bounds: X=[{minv[0]:.3f}, {maxv[0]:.3f}]  Y=[{minv[1]:.3f}, {maxv[1]:.3f}]  Z=[{minv[2]:.3f}, {maxv[2]:.3f}]")
