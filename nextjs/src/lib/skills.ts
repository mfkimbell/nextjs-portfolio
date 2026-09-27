/**
 * The skill list, and the one place it is written down.
 *
 * It used to live inside SkillsCarousel, which is a client component that
 * preloads 19 icon GLBs and 19 bird GLBs at MODULE SCOPE - so importing it
 * just to read the labels would have kicked off about forty model downloads
 * on any page that did. Hence a plain data module: the carousel reads it, the
 * CRT's Skills board reads it, and neither pays for the other's assets.
 */

/**
 * Per-skill overrides for tuning where each bird sits:
 *   birdY     - extra Y offset ADDED on top of the auto placement.
 *               Positive = bird higher above icon, negative = deeper into icon.
 *   birdX     - horizontal shift of the bird relative to icon center.
 *   birdScale - multiplier on the global BIRD_SCALE for this bird only.
 *   flat      - render this skill's icon AND bird with hard faceted shading.
 * All fields optional; unspecified = default (auto placement, no scale change).
 */
export type SkillDef = {
  label: string;
  glb: string;
  bird: string;
  birdY?: number;
  birdX?: number;
  birdScale?: number;
  flat?: boolean;
};

export const SKILLS: SkillDef[] = [
  { label: "React",          glb: "/icons_glb/react.glb?v=2",      bird: "/birds/grey_bird_cyan.glb" },
  { label: "NextJS",         glb: "/icons_glb/nextjs.glb",         bird: "/birds/blue_orange_bird_blue.glb" },
  { label: "Typescript",     glb: "/icons_glb/typescript.glb",     bird: "/birds/white_tan_bird_blue.glb" },
  { label: "Python",         glb: "/icons_glb/python.glb",         bird: "/birds/blue_orange_bird_python.glb" },
  { label: "C#",             glb: "/icons_glb/csharp.glb",         bird: "/birds/grey_bird_purple.glb" },
  { label: ".NET8",          glb: "/icons_glb/dotnet.glb",         bird: "/birds/blue_orange_bird_purple.glb" },
  { label: "AWS",            glb: "/icons_glb/aws.glb",            bird: "/birds/white_tan_bird.glb" },
  { label: "Bedrock",        glb: "/icons_glb/bedrock.glb",        bird: "/birds/white_tan_bird_teal.glb" },
  { label: "TensorFlow",     glb: "/icons_glb/tensorflow.glb",     bird: "/birds/grey_bird_orange.glb" },
  { label: "PyTorch",        glb: "/icons_glb/pytorch.glb",        bird: "/birds/orange_bird_red.glb" },
  { label: "Google Cloud",   glb: "/icons_glb/googlecloud.glb",    bird: "/birds/blue_orange_bird_gcp.glb" },
  { label: "Kubernetes",     glb: "/icons_glb/kubernetes.glb",     bird: "/birds/grey_bird_royalblue.glb" },
  { label: "Kafka",          glb: "/icons_glb/kafka.glb?v=2",      bird: "/birds/white_tan_bird_red.glb" },
  { label: "Harness",        glb: "/icons_glb/harness.glb",        bird: "/birds/white_tan_bird_royalblue.glb" },
  { label: "Github Actions", glb: "/icons_glb/githubactions.glb",  bird: "/birds/grey_bird_blue.glb" },
  { label: "Ansible",        glb: "/icons_glb/ansible.glb",        bird: "/birds/blue_orange_bird_red.glb" },
  { label: "Docker",         glb: "/icons_glb/docker.glb",         bird: "/birds/orange_bird_blue.glb", flat: true },
  { label: "Postgres",       glb: "/icons_glb/postgres.glb",       bird: "/birds/white_tan_bird_blue.glb" },
  { label: "Terraform",      glb: "/icons_glb/terraform.glb",      bird: "/birds/blue_orange_bird_purple.glb" },
];

/**
 * The flat PNG twin of a skill's 3D icon, for places that draw pixels rather
 * than meshes - the CRT's Skills board.
 *
 * Derived from the GLB's own basename (cache-busting query and all) rather
 * than being a second field to keep in step, because /public/icons holds
 * exactly the same 19 names as /public/icons_glb. `crt/` is the downscaled
 * set: the originals run up to 2000px and 1.4MB for the nineteen, which is a
 * lot to send for art that lands on a 30-pixel tile.
 */
export function skillIcon(skill: SkillDef): string {
  const file = skill.glb.split("/").pop() ?? "";
  return `/icons/crt/${file.replace(/\.glb.*$/, "")}.png`;
}
