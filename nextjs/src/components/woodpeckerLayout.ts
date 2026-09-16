// components/woodpeckerLayout.ts
/**
 * Shared placement constants for the woodpecker overlay.
 *
 * woodpecker_peck_v15.glb is authored against an implied tree surface at model
 * z = 0. The bird lives at z > 0 with its back facing +z, the foot grip point
 * is at y = 0. At rest the beak tip sits at z = +0.55, clear of the surface; the
 * strike drives it to z = -0.206, i.e. 0.08 into the bark. Only the impact frames
 * penetrate - rest, pull and cock poses are unchanged since v9.
 *
 * Page alignment belongs HERE, not in the model. v6/v7 baked a -0.62/-1.00
 * "reach" offset into the strike target to make the beak meet the painted bark;
 * that distorted the bird's anatomy. The correct knob is SURFACE_X: it slides
 * the whole contact plane - feet, tail and beak together - onto the bark.
 *
 * WoodpeckerGLB rotates the model +90deg about Y, mapping model z = 0 onto
 * world x = SURFACE_X. Measured against the painted trunk, the bark edge sits
 * at ~75.5px and the contact plane at ~84.7px when SURFACE_X = -0.65, hence the
 * -0.727 below. Re-measure if you move the tree or resize the canvas.
 *
 * At BIRD_SCALE 0.0875 one model unit is about 10.4 page px - worth knowing
 * when judging whether an animation amplitude will actually be visible.
 */
export const SURFACE_X = -0.727;
export const BIRD_SCALE = 0.0875;
export const BIRD_Y = 0.22;
/** beak impact point in canvas space, from the model's (0, 2.209, 0) */
export const IMPACT_Y = BIRD_Y + BIRD_SCALE * 2.209;
