// Vite already declares `?raw` imports via vite/client, but make the
// markdown extension explicit so editors don't squiggle on `.md?raw`.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
