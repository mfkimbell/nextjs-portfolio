/**
 * Which of the three ring locations is currently drawn (set every frame by
 * CampfireScene's Location). Off-screen work - canvas screens redrawn and
 * re-uploaded to the GPU, background videos decoding - checks this and stands
 * down, which matters a lot on phones: the arcade CRTs and the cabin computer
 * used to repaint 24 times a second while you were at the campfire.
 */
export const locationShown: boolean[] = [true, true, true];
export const LOC_CAMPFIRE = 0;
export const LOC_ARCADE = 1;
export const LOC_CABIN = 2;
