import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { copy } from "fs-extra";
import templateJSON from "./template/template.package.json";

export async function createPackage(
  packageName: string,
  packageDescription?: string
) {
  const packageDir = join("packages", packageName);

  console.log("Making package directory...");
  // Make directory for package
  await mkdir(packageDir);

  console.log("Changing subdirectory...");
  // Change to subdirectory
  process.chdir(packageDir);

  console.log("Creating filedata");
  // Create folder structure
  await Promise.all([mkdir("src")]);

  const templateDir = join("..", "generator", "src", "template");
  // Create files
  await writeFile(
    join("src", "index.ts"),
    `console.log('Hello, from @idle/${packageName}');`
  );
  await writeFile(
    ".eslintrc.json",
    await readFile(join(templateDir, "template.eslintrc.json"), "utf8")
  );

  const packageJSON = {
    ...templateJSON,
    name: templateJSON.name.replace("{name}", packageName),
    description: packageDescription ?? "",
  };

  // Create package.json
  await writeFile(`package.json`, JSON.stringify(packageJSON, null, 2));

  // Create readme.md
  await writeFile(
    `Readme.md`,
    `# ${packageName}
${packageDescription}
  `
  );

  process.chdir(join("..", ".."));

  // Copy default files over
  await copy(
    join("packages", "generator", "src", "template", "default"),
    packageDir
  );
}
