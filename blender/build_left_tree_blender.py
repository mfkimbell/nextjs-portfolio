#!/usr/bin/env python3
"""
build_left_tree_blender.py  --  run INSIDE Blender.

Builds the left-side portfolio tree trunk as a smooth-shaded low-poly mesh
and exports it to nextjs/public/models/left_tree.glb.

WHY THESE NUMBERS
-----------------
Geometry is derived from the reference art, public/fauna/left_tree.png:

    drawn artwork height ........ 15339 px
    drawn trunk width (median) ..   380 px   -> aspect 40.366 : 1
    root flare max width ........  1829 px   -> 4.813x the trunk width
    flare height ................  ~550 px   (t = 0.036)

The trunk is scaled so its height is exactly TRUNK_HEIGHT world units, which
makes the trunk diameter TRUNK_HEIGHT / 40.366. The per-height width profile
below (WIDTH_PROFILE) is the median-filtered column width measured straight
off the PNG, so the subtle waist around mid-height is the real one.

AESTHETIC
---------
Matches the LOGS that frame the project sign (Projects.tsx makeLogGeometry),
which is the look that was actually approved -- specifically the horizontal
one, whose stretched diagonal facets read as diamonds rather than as obvious
paired triangles:
  * 8-sided cross-section, ~348 triangles (down from ~2,676)
  * FLAT shading -- every quad is its own hard plane
  * vertex ring twists continuously with height, so the quads shear and the
    triangulation never lines up into a regular zigzag
  * lumpy cross-section from harmonics 2 and 3 only, at the logs' amplitudes
  * baked vertex colours (COLOR_0), no textures

This REPLACES the earlier smooth-shaded version. That one deliberately had no
facets anywhere; this one is all facets, because the log frame established the
house style.

The silhouette is deliberately NOT a perfect ruler: a low-frequency sway is
added to the centreline (see SWAY_*) and the cross-section is a slowly
rotating irregular polygon rather than a circle. Width still stays within
about +/-9% for the whole climb, per the reference.

Branches are intentionally omitted -- they get added later.

Run:
    blender -b -P blender/build_left_tree_blender.py
or paste/exec it from Blender's scripting tab.
"""

import bpy
import bmesh
import math
import os
import random
from mathutils import Vector

# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------

SEED = 20260820
random.seed(SEED)

# --- reference-art measurements (pixels) ---
PNG_HEIGHT_PX = 15339.0
PNG_TRUNK_W_PX = 380.0
PNG_FLARE_W_PX = 1829.0

ASPECT = PNG_HEIGHT_PX / PNG_TRUNK_W_PX          # 40.366

# --- world scale ---
TRUNK_HEIGHT = 9.20                              # units, matches left_tree_config.json
TRUNK_DIAM = TRUNK_HEIGHT / ASPECT               # 0.22791
TRUNK_R = TRUNK_DIAM / 2.0                       # 0.11396

# --- root flare ---
# Measured widths / trunk width: t=0 -> 4.813, t=.0167 -> 2.347, t=.0333 -> 1.09.
# r = 1 + (RATIO-1)*(1 - t/T)^POW fits that to within ~4% at T=.036, POW=1.55.
# It is a low wide skirt, not a tall trumpet -- getting this wrong was the most
# obvious error in the first pass.
FLARE_RATIO = PNG_FLARE_W_PX / PNG_TRUNK_W_PX    # 4.813
FLARE_T = 0.036                                  # flare dies out by 3.6% of height
FLARE_POW = 1.55
FLARE_ROOTS = 4                                  # skirt splays into lobes, not a cone.
                                                 # 4, not 5, so each root gets exactly two
                                                 # of the 8 radial segments -- 5 roots across
                                                 # 8 segments lands them off-centre.
FLARE_ROOT_AMP = 0.20

# --- tessellation: matched to the TOP (horizontal) log in Projects.tsx ------
# The two logs on the project sign use identical settings but read differently,
# and the horizontal one is the good one. The difference is the shape of each
# quad. Facet size around the trunk is circumference/RADIAL; up the trunk it is
# the ring gap. That ratio is what the eye reads:
#
#     top (horizontal) log   0.789 / 0.134 = 5.9 : 1   <- stretched diagonals
#     side (vertical) log    0.356 / 0.134 = 2.7 : 1   <- near-square, obvious
#                                                         triangle pairs
#
# DENSITY IS ONE KNOB ON PURPOSE.
# Raising ring count alone drives that ratio toward the side log's square quads
# and the faceting collapses into paired triangles. RADIAL and the ring counts
# must scale TOGETHER to hold 5.83 : 1, so DETAIL drives all three and they
# cannot drift apart.
#
#     DETAIL 1 ->  8 radial, 17 trunk rings ->   348 tris   (the first approved cut)
#     DETAIL 2 -> 16 radial, 34 trunk rings ->  1372 tris
#     DETAIL 3 -> 24 radial, 51 trunk rings ->  3068 tris
#
# Override without editing:  TREE_DETAIL=3 blender -b -P ...
# 1, not 2. Doubling density HALVES the angle between neighbouring facets
# (8 sides = 45 deg apart, 16 sides = 22.5 deg), and that angle is exactly what
# decides how differently two facets catch the light. More polygons therefore
# read as LESS shaded, not more. 8 also matches the sign frame's logs exactly.
DETAIL = int(os.environ.get("TREE_DETAIL", "1"))

RADIAL = 8 * DETAIL
RINGS_TRUNK = 17 * DETAIL
RINGS_FLARE = 4 * DETAIL

# --- centreline sway: the "not a straight line" part ---
# Peak-to-peak drift is ~0.13 units, i.e. a bit over half a trunk diameter
# across the whole 9.2 units. Reads as a living trunk, not a lamp post.
SWAY_X = 0.075
SWAY_Y = 0.045
SWAY_ANCHOR_T = 0.09                             # roots stay planted at the base

# --- cross-section irregularity (smooth, not noisy) ---
# The phase DRIFTS as you climb, which is what makes the outline undulate.
# With no drift the lobes line up into straight flutes and the trunk reads as a
# machined dowel -- that was the other error in the first pass.
# Cross-section harmonics. A ring of N samples cannot represent a harmonic
# above N/2 -- beyond that it ALIASES into a false low-frequency wobble instead
# of adding detail. At DETAIL 1 (8 radial) only harmonics 2 and 3 are legal, so
# the finer ones are added back automatically as density allows. This is the
# real payoff of more polygons: genuinely finer bark, not just smaller facets.
_LOBES = [(2, 0.10), (3, 0.06), (5, 0.025), (7, 0.015)]
LOBES = tuple((k, a) for k, a in _LOBES if k <= RADIAL // 2)
LOBE_DRIFT = 7.5                                 # radians of phase drift over full height

# Continuous twist of the vertex ring, radians over the full height. This is
# the OTHER half of the top log's look: its vertices rotate 0.31 of a segment
# per ring, so every quad is sheared and the triangulation reads as random
# diamonds. The tree used to alternate a half-step stagger on/off, which is a
# regular zigzag instead. 4.3 rad reproduces that 0.31-of-a-segment shear at
# the new ring spacing, while leaving the flare (t < 0.036) essentially
# untwisted so the roots do not spiral.
#
# This value is DENSITY-INDEPENDENT. The shear per ring works out to
#   TWIST_TOTAL * (1 - FLARE_T)/RINGS_TRUNK * RADIAL/(2*pi)
# and since DETAIL scales RADIAL and RINGS_TRUNK together, their ratio -- and
# so the shear -- is unchanged. 4.3 holds 0.31 of a segment at every DETAIL.
TWIST_TOTAL = 4.3
BULGE_AMP = 0.035                                # slow radius swell/pinch up the trunk

# --- bark palette, sRGB. Sampled from left_tree.png. ---
BARK_PALETTE = ("7d5734", "8e6641", "9c7149", "a87b53", "b0835b")
KNOT_COLOR = "402b1c"
KNOT_TS = (0.09, 0.20, 0.34, 0.57, 0.72, 0.84)   # heights that get a darker patch
KNOT_HALF_WIDTH = 0.022                          # in t
# Colour is PER VERTEX and interpolates across every face, so there is no facet
# anywhere -- not in the shading, not in the colour. Contrast is deliberately
# low: with flat shading the facets already come from the lighting, so the
# colour only needs to add a slow tonal drift, not compete with them.
TONE_CONTRAST = 0.55
# Per-FACET random tone, +/- this fraction. This is the "texture" in the low-poly
# look: neighbouring facets never quite match, so the eye reads carved wood
# rather than a tinted cylinder. Lighting alone cannot do this -- two facets at
# the same angle light identically no matter how good the lamp setup is.
FACE_TONE_JITTER = 0.115

OBJECT_NAME = "LeftTree"

# --- output ---
REPO = "/Users/mkimbell/repositories/nextjs-portfolio"
GLB_PATH = os.path.join(REPO, "nextjs", "public", "models", "left_tree.glb")
BLEND_PATH = os.path.join(REPO, "blender", "left_tree.blend")

# Median-filtered trunk width measured off left_tree.png, sampled at 61 evenly
# spaced heights from t=0 (ground) to t=1 (top cut), normalised to the 380 px
# trunk width. Index 0-2 are inside the flare and are replaced by the analytic
# flare curve below; index 60 is the top rim and is clamped to its neighbour.
WIDTH_PROFILE = [
    1.0000, 1.0000, 1.0000, 1.0105, 1.0105, 1.0105, 1.0000, 1.0000, 1.0058,
    1.0109, 1.0092, 1.0105, 1.0158, 0.9974, 1.0105, 1.0046, 1.0026, 1.0132,
    1.0105, 0.9745, 0.9711, 0.9579, 0.9632, 0.9632, 0.9553, 0.9395, 0.9342,
    0.9316, 0.9316, 0.9316, 0.9289, 0.9105, 0.9126, 0.9211, 0.9158, 0.9211,
    0.9237, 0.9421, 0.9526, 0.9579, 0.9553, 0.9658, 0.9658, 0.9658, 0.9742,
    0.9776, 1.0097, 1.0158, 1.0105, 1.0034, 1.0132, 1.0158, 1.0158, 1.0158,
    1.0184, 1.0066, 1.0105, 1.0133, 1.0158, 1.0184, 1.0184,
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


PALETTE_LIN = [hex_to_linear(h) for h in BARK_PALETTE]
KNOT_LIN = hex_to_linear(KNOT_COLOR)


def smoothstep(edge0, edge1, x):
    t = min(1.0, max(0.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def sample_profile(t):
    """Measured trunk width (relative to TRUNK_DIAM) at height fraction t."""
    x = min(1.0, max(0.0, t)) * (len(WIDTH_PROFILE) - 1)
    i = int(x)
    if i >= len(WIDTH_PROFILE) - 1:
        return WIDTH_PROFILE[-1]
    f = x - i
    return WIDTH_PROFILE[i] * (1 - f) + WIDTH_PROFILE[i + 1] * f


def radius_at(t):
    """Trunk radius (no flare), including the slow swell/pinch."""
    bulge = 1.0 + BULGE_AMP * (0.6 * math.sin(2 * math.pi * 2.3 * t + 1.1)
                               + 0.4 * math.sin(2 * math.pi * 5.1 * t + 3.7))
    return TRUNK_R * sample_profile(t) * bulge


def flare_at(t, theta):
    """Extra radius from the root skirt, splayed into FLARE_ROOTS lobes."""
    if t >= FLARE_T:
        return 0.0
    u = 1.0 - (t / FLARE_T)
    amount = TRUNK_R * (FLARE_RATIO - 1.0) * (u ** FLARE_POW)
    lobe = 1.0 + FLARE_ROOT_AMP * math.cos(FLARE_ROOTS * theta + 0.6)
    return amount * lobe


def sway_at(t):
    """Centreline offset. Low-frequency only -- no jitter, so it stays smooth."""
    anchor = smoothstep(0.0, SWAY_ANCHOR_T, t)
    x = (0.55 * math.sin(2 * math.pi * 0.85 * t + 0.70)
         + 0.30 * math.sin(2 * math.pi * 1.90 * t + 2.10)
         + 0.15 * math.sin(2 * math.pi * 3.30 * t + 4.40))
    y = (0.60 * math.sin(2 * math.pi * 0.70 * t + 1.90)
         + 0.40 * math.sin(2 * math.pi * 1.60 * t + 0.30))
    return SWAY_X * x * anchor, SWAY_Y * y * anchor


def lobe_mult(theta, t):
    """Slowly rotating, slowly breathing non-circular cross-section."""
    m = 1.0
    for i, (k, amp) in enumerate(LOBES):
        # amplitude itself wanders with height so no lobe survives the whole climb
        a = amp * (0.65 + 0.35 * math.sin(2 * math.pi * (0.8 + 0.5 * i) * t + i * 2.2))
        m += a * math.cos(k * theta + LOBE_DRIFT * t * (0.7 + 0.15 * i) + k * 1.7)
    return m


def ring_heights():
    """Denser sampling through the flare, even spacing up the trunk."""
    ts = [FLARE_T * (i / RINGS_FLARE) ** 1.4 for i in range(RINGS_FLARE)]
    ts += [FLARE_T + (1.0 - FLARE_T) * (i / RINGS_TRUNK)
           for i in range(RINGS_TRUNK + 1)]
    return ts


# --------------------------------------------------------------------------
# build the mesh
# --------------------------------------------------------------------------

def build_mesh():
    bm = bmesh.new()
    rings = []
    ts = ring_heights()

    for j, t in enumerate(ts):
        cx, cy = sway_at(t)
        z = t * TRUNK_HEIGHT
        r0 = radius_at(t)
        # Continuous twist rather than an alternating half-step stagger --
        # see TWIST_TOTAL. Proportional to HEIGHT, not ring index, so the
        # tightly-packed flare rings barely rotate.
        stagger = TWIST_TOTAL * t
        ring = []
        for s in range(RADIAL):
            theta = 2 * math.pi * s / RADIAL + stagger
            r = r0 * lobe_mult(theta, t) + flare_at(t, theta)
            v = bm.verts.new((cx + r * math.cos(theta),
                              cy + r * math.sin(theta),
                              z))
            ring.append(v)
        rings.append(ring)

    bm.verts.ensure_lookup_table()

    side_faces = []
    for j in range(len(rings) - 1):
        lo, hi = rings[j], rings[j + 1]
        for s in range(RADIAL):
            s2 = (s + 1) % RADIAL
            f = bm.faces.new((lo[s], lo[s2], hi[s2], hi[s]))
            side_faces.append(f)

    cap_bottom = bm.faces.new(tuple(reversed(rings[0])))
    cap_top = bm.faces.new(tuple(rings[-1]))

    bm.normal_update()

    # FLAT everywhere. The smooth-shaded version had no visible facets at all;
    # the whole point of matching the logs is that each quad catches the light
    # as its own hard plane.
    for f in bm.faces:
        f.smooth = False

    me = bpy.data.meshes.new(OBJECT_NAME)
    bm.to_mesh(me)
    bm.free()
    return me, ts


# --------------------------------------------------------------------------
# vertex colours -- flat-ish bark patches, owl style
# --------------------------------------------------------------------------

def paint(me):
    """Flat per-FACE colour, written to the CORNER domain, exported as COLOR_0.

    WHY NOT PER-VERTEX. A POINT-domain colour interpolates ACROSS each facet,
    which softens precisely the boundary that makes a low-poly trunk read as
    carved. Measured on the previous build, 17% of the entire tonal range was
    being spent inside single facets rather than between them. Writing one flat
    colour to every corner of a face puts all of that contrast on the edges,
    where it draws the facet.

    CORNER rather than FACE domain purely for exporter support -- the effect is
    identical, since all of a face's corners get the same value.
    """
    attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")

    # Overlaid low-frequency waves -> a smooth field with no repeating pattern.
    # The angular term MUST use an integer harmonic: theta comes from atan2 and
    # wraps at +/-pi, so a fractional harmonic makes the field discontinuous
    # there and paints a hard vertical seam straight up the trunk.
    phases = [(random.uniform(0.5, 1.6), random.uniform(0, 6.28),
               float(random.choice((1, 2, 3))), random.uniform(0, 6.28))
              for _ in range(4)]

    def field(t, theta):
        v = 0.0
        for (fz, pz, ft, pt) in phases:
            v += math.sin(2 * math.pi * fz * t * 3.0 + pz
                          + 1.1 * math.cos(ft * theta + pt))
        return max(-1.0, min(1.0, v / (len(phases) * 0.70)))

    # Own RNG instance so the facet jitter cannot be shifted by unrelated
    # random() calls elsewhere in the build.
    jitter = random.Random(SEED ^ 0x5EED)
    npal = len(PALETTE_LIN) - 1

    for poly in me.polygons:
        cx, cy, cz = poly.center
        t = cz / TRUNK_HEIGHT
        theta = math.atan2(cy, cx)

        idx = (field(t, theta) * TONE_CONTRAST * 0.5 + 0.5) * npal
        i0 = max(0, min(npal - 1, int(idx)))
        f = min(1.0, max(0.0, idx - i0))
        col = [PALETTE_LIN[i0][k] * (1 - f) + PALETTE_LIN[i0 + 1][k] * f
               for k in range(3)]

        # knots: darker blushes at a few heights, on one side only
        for ki, kt in enumerate(KNOT_TS):
            d = abs(t - kt)
            if d < KNOT_HALF_WIDTH:
                facing = math.cos(theta - (0.0 if ki % 2 == 0 else math.pi))
                if facing > 0.25:
                    ease = smoothstep(0.0, 1.0, 1 - d / KNOT_HALF_WIDTH)
                    mix = ease * (facing - 0.25) / 0.75 * 0.45
                    col = [col[k] * (1 - mix) + KNOT_LIN[k] * mix for k in range(3)]
                break

        # roots read darker and damper
        root = 1.0 - 0.28 * (1.0 - smoothstep(0.0, FLARE_T * 1.8, t))
        col = [c * root for c in col]

        # the per-facet break-up
        j = 1.0 + FACE_TONE_JITTER * (jitter.random() * 2.0 - 1.0)
        col = [max(0.0, min(1.0, c * j)) for c in col]

        for li in poly.loop_indices:
            attr.data[li].color = (col[0], col[1], col[2], 1.0)

# --------------------------------------------------------------------------
# material
# --------------------------------------------------------------------------

def make_material():
    mat = bpy.data.materials.get("TreeBark") or bpy.data.materials.new("TreeBark")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (100, 0)
    vcol = nt.nodes.new("ShaderNodeVertexColor")
    vcol.location = (-200, 0)
    vcol.layer_name = "Col"

    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.95

    nt.links.new(vcol.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main():
    # clear the default cube and any previous build (including the orphaned
    # mesh datablock, otherwise the rebuild is named LeftTree.001)
    for name in ("Cube", OBJECT_NAME):
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)

    me, ts = build_mesh()
    paint(me)
    me.materials.append(make_material())

    ob = bpy.data.objects.new(OBJECT_NAME, me)
    bpy.context.collection.objects.link(ob)

    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

    # ---- report ----
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    trunk_r = [math.hypot(v.co.x - sway_at(v.co.z / TRUNK_HEIGHT)[0],
                          v.co.y - sway_at(v.co.z / TRUNK_HEIGHT)[1])
               for v in me.vertices if v.co.z > TRUNK_HEIGHT * FLARE_T * 1.2]
    print("---- LeftTree ----")
    print("verts %d  tris %d" % (len(me.vertices),
                                 sum(len(p.vertices) - 2 for p in me.polygons)))
    print("height        %.4f  (target %.4f)" % (max(zs) - min(zs), TRUNK_HEIGHT))
    print("trunk diam    %.5f  (target %.5f)" % (2 * (sum(trunk_r) / len(trunk_r)),
                                                 TRUNK_DIAM))
    print("aspect H/D    %.3f  (png %.3f)" % ((max(zs) - min(zs)) /
                                              (2 * (sum(trunk_r) / len(trunk_r))),
                                              ASPECT))
    print("bbox X %.4f..%.4f  Y %.4f..%.4f  Z %.4f..%.4f"
          % (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)))
    print("flare diam    %.4f  (png %.4f)"
          % (2 * (radius_at(0.0) + flare_at(0.0, 0.0) / (1 + FLARE_ROOT_AMP)),
             PNG_FLARE_W_PX / PNG_HEIGHT_PX * TRUNK_HEIGHT))
    print("width band    %.3f .. %.3f of nominal (png 0.911 .. 1.018)"
          % (min(sample_profile(i / 200) for i in range(1, 201)),
             max(sample_profile(i / 200) for i in range(1, 201))))

    # ---- export ----
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    kwargs = dict(
        filepath=GLB_PATH,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_normals=True,
    )
    try:
        bpy.ops.export_scene.gltf(export_vertex_color="ACTIVE", **kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    print("wrote", GLB_PATH, os.path.getsize(GLB_PATH), "bytes")

    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print("saved", BLEND_PATH)


main()
