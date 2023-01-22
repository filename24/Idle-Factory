import { createTsupConfig } from "../../tsup.config";

export default createTsupConfig({
  minify: true,
  dts: false,
  format: ["esm"],
});
