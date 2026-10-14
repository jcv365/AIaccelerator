// The package's main entry runs a debug routine on import, so we load its inner module directly.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
