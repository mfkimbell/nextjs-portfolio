/*
 * ============================================================================
 *  Toppling tables
 * ============================================================================
 *
 * A prop's fall is not described by one number. Which way it goes decides
 * WHERE it hinges (the most-forward point of its hull moves as the direction
 * moves), how far it has to be pushed before gravity takes over, how far it
 * travels before it hits the ground, and how fast it swings. Bake one
 * direction's worth of constants and the fall is only correct at that one
 * direction - drag the heading slider and the prop sinks through the ground or
 * stops half way.
 *
 * So the heading knob reads from here instead. Each prop is measured at 24
 * headings, 15 degrees apart, and TipOver interpolates between the two
 * neighbouring rows. Every number was taken off the real mesh in Blender:
 *
 *   pivotX, pivotZ   the hinge, in the camp's own (Location) space, dropped to
 *                    the ground plane. For a free-standing prop this is the
 *                    most-forward point of the HULL, not of its base - both
 *                    bags overhang their footprint (the right one by 0.19) and
 *                    hinging on the base swings that overhang 0.2 through the
 *                    dirt. For a prop planted in the ground (the rod is buried
 *                    0.24) it is where the shaft crosses the ground, and it
 *                    does not move with the heading at all.
 *   balance          radians of tip before the centre of mass crosses the
 *                    hinge. Negative means it is already past and will fall
 *                    unaided, which is why the rod needs no push when it is
 *                    shoved the way it already leans and a real one when it is
 *                    shoved back against that lean.
 *   rest             radians at which the hull first reaches the ground.
 *                    Measured only against geometry that STARTS above ground,
 *                    or a permanently buried vertex reads as instant contact.
 *   gravity          m.g.d / I about that hinge, in rad/s^2, from interior
 *                    point-sampling of the mesh for both the centre of mass
 *                    and the moment of inertia.
 *
 * Regenerating: the measuring script is in the session notes; it imports the
 * prop's GLB, applies its <Selectable> transform, samples the interior by
 * ray-cast parity, then sweeps the heading. Re-run it if a prop is moved,
 * rescaled or swapped.
 */

/** [pivotX, pivotZ, balance, rest, gravity] */
export type TipRow = readonly [number, number, number, number, number];
export type TipTable = readonly TipRow[];

export const TIP_TABLES: Record<string, TipTable> = {
  // right-hand bag by the fishing rod
  bag: [
    [-2.9079, 2.2232, 0.8444, 1.5673, 18.920], [-2.8217, 2.2337, 0.8779, 1.5673, 18.210],
    [-2.7394, 2.2041, 0.8840, 1.5708, 17.963], [-2.6762, 2.1440, 0.8703, 1.5708, 18.102],
    [-2.6400, 2.0670, 0.8418, 1.5708, 18.558], [-2.6392, 1.9843, 0.7888, 1.5673, 19.414],
    [-2.6741, 1.9123, 0.7022, 1.5673, 20.660], [-2.6972, 1.8558, 0.6683, 1.5603, 21.383],
    [-2.7131, 1.7998, 0.6833, 1.5568, 21.528], [-2.7453, 1.7497, 0.6940, 1.5568, 21.482],
    [-2.7975, 1.7211, 0.6742, 1.5568, 21.498], [-2.8510, 1.7000, 0.6719, 1.5603, 21.149],
    [-2.9079, 1.6506, 0.7584, 1.5673, 19.913], [-2.9858, 1.6215, 0.8283, 1.5708, 18.828],
    [-3.0710, 1.6297, 0.8682, 1.5708, 18.165], [-3.1496, 1.6705, 0.8912, 1.5708, 17.834],
    [-3.2076, 1.7392, 0.8972, 1.5708, 17.853], [-3.2294, 1.8261, 0.8781, 1.5673, 18.329],
    [-3.2079, 1.9123, 0.8266, 1.5673, 19.309], [-3.1546, 1.9784, 0.7462, 1.5673, 20.603],
    [-3.0794, 2.0113, 0.6220, 1.5673, 22.088], [-3.0206, 2.0250, 0.5235, 1.5673, 22.891],
    [-3.0194, 2.1055, 0.6793, 1.5673, 21.450], [-2.9781, 2.1746, 0.7768, 1.5673, 20.087],
  ],
  // left-hand voxel hiking bag by the banjo bear
  hikeBag: [
    [2.9143, 1.8436, 0.6451, 1.5638, 19.625], [2.9721, 1.8250, 0.6223, 1.5673, 20.131],
    [3.0243, 1.7999, 0.6152, 1.5673, 20.495], [3.0569, 1.7519, 0.5749, 1.5673, 21.034],
    [3.0809, 1.7055, 0.5535, 1.5673, 21.234], [3.1226, 1.6651, 0.6056, 1.5673, 20.656],
    [3.1384, 1.6093, 0.6239, 1.5673, 20.221], [3.1319, 1.5509, 0.6264, 1.5638, 19.875],
    [3.1312, 1.4840, 0.6774, 1.5638, 19.175], [3.1033, 1.4203, 0.7093, 1.5603, 18.734],
    [3.0507, 1.3729, 0.7195, 1.5638, 18.617], [2.9839, 1.3496, 0.7122, 1.5638, 18.798],
    [2.9143, 1.3536, 0.6874, 1.5638, 19.256], [2.8542, 1.3850, 0.6407, 1.5568, 19.975],
    [2.8074, 1.4241, 0.6015, 1.5568, 20.610], [2.7853, 1.4802, 0.5300, 1.5638, 21.376],
    [2.7653, 1.5233, 0.5046, 1.5638, 21.587], [2.7159, 1.5561, 0.5831, 1.5568, 20.843],
    [2.6866, 1.6093, 0.6313, 1.5568, 20.158], [2.6767, 1.6729, 0.6685, 1.5638, 19.519],
    [2.6848, 1.7417, 0.7050, 1.5638, 18.927], [2.7221, 1.8015, 0.7176, 1.5638, 18.657],
    [2.7793, 1.8431, 0.7143, 1.5638, 18.666], [2.8483, 1.8556, 0.6863, 1.5603, 19.033],
  ],
  // the fishing rod. Planted, so the hinge never moves; note how `balance`
  // swings from -0.38 to +0.38 - pushed the way it leans it falls on its own,
  // pushed back against the lean it has to be shoved over its own weight.
  rod: [
    [-2.5593, 2.1909, -0.3823, 1.0402, 8.089], [-2.5593, 2.1909, -0.3621, 1.0891, 8.148],
    [-2.5593, 2.1909, -0.3185, 1.1170, 8.297], [-2.5593, 2.1909, -0.2526, 1.1449, 8.507],
    [-2.5593, 2.1909, -0.1673, 1.2008, 8.728], [-2.5593, 2.1909, -0.0681, 1.2846, 8.893],
    [-2.5593, 2.1909,  0.0371, 1.3753, 8.947], [-2.5593, 2.1909,  0.1391, 1.4486, 8.869],
    [-2.5593, 2.1909,  0.2291, 1.5359, 8.688], [-2.5593, 2.1909,  0.3012, 1.6057, 8.465],
    [-2.5593, 2.1909,  0.3516, 1.6406, 8.264], [-2.5593, 2.1909,  0.3788, 1.6162, 8.130],
    [-2.5593, 2.1909,  0.3823, 1.5638, 8.089], [-2.5593, 2.1909,  0.3621, 1.5080, 8.148],
    [-2.5593, 2.1909,  0.3185, 1.4521, 8.297], [-2.5593, 2.1909,  0.2526, 1.3998, 8.507],
    [-2.5593, 2.1909,  0.1673, 1.2881, 8.728], [-2.5593, 2.1909,  0.0681, 1.1973, 8.893],
    [-2.5593, 2.1909, -0.0371, 1.1275, 8.947], [-2.5593, 2.1909, -0.1391, 1.0263, 8.869],
    [-2.5593, 2.1909, -0.2291, 0.9669, 8.688], [-2.5593, 2.1909, -0.3012, 0.9355, 8.465],
    [-2.5593, 2.1909, -0.3516, 0.9355, 8.264], [-2.5593, 2.1909, -0.3788, 0.9704, 8.130],
  ],
};

const TAU = Math.PI * 2;

/** Read a table at any heading, interpolating between the two nearest rows. */
export function tipAt(table: TipTable, heading: number) {
  const n = table.length;
  const u = (((heading % TAU) + TAU) % TAU) / TAU * n;
  const i = Math.floor(u) % n;
  const j = (i + 1) % n;
  const f = u - Math.floor(u);
  const a = table[i], b = table[j];
  const mix = (x: number, y: number) => x + (y - x) * f;
  return {
    pivotX: mix(a[0], b[0]),
    pivotZ: mix(a[1], b[1]),
    balance: mix(a[2], b[2]),
    rest: mix(a[3], b[3]),
    gravity: mix(a[4], b[4]),
  };
}

/**
 * Smallest angular velocity that gets a prop over its own tipping point.
 *
 * Energy: (1/2).w^2 must beat k.(1 - cos(balance)). Expressing the shove as a
 * MULTIPLE of this rather than as a raw rad/s is what makes the heading knob
 * safe to drag - the barrier changes with direction (3.6 one way, 2.5 another
 * for the same bag), so a fixed shove that tips it over at one angle leaves it
 * rocking back upright at the next.
 */
export function tipBarrier(gravity: number, balance: number) {
  /* A prop already past its tipping point has a barrier of zero and falls on
   * its own - but then the shove knob would have nothing to scale and would go
   * dead over a whole range of headings. Floor it at a nominal 15 degrees so
   * "shove" always means something, whichever way the prop is pushed. */
  const b = Math.max(balance, 0.26);
  return Math.sqrt(2 * gravity * (1 - Math.cos(b)));
}
