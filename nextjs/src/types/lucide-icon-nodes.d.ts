/*
 * lucide-react ships each icon's raw drawing data as `__iconNode` in its
 * per-icon ESM modules. RetroDesktop reads two of them to paint the GitHub
 * and LinkedIn app icons into a canvas; the package's own typings only
 * describe the React components, so the deep path is declared here.
 */
declare module "lucide-react/dist/esm/icons/*.js" {
  export const __iconNode: Array<[string, Record<string, string>]>;
}
