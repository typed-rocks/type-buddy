/** **********************************************************************
 *  Commander.js CLI entry point
 ********************************************************************** */
import {Command} from "commander";
import {fnsToTernaries, getAllTypeConditionalDeclarations, ternaryToFn} from "./agnostic";
import path from "node:path";
import {readFileSync} from "node:fs";

const program = new Command();

program
  .name("ternary-cli")
  .description(
    "CLI that converts TypeScript conditional type aliases to function-like code and back."
  )
  .version("1.0.0");

program
  .command("get-conditionals <file>")
  .description("List all type aliases in the file that contain a conditional type.")
  .action((file) => {
    const fullPath = path.resolve(file);
    const content = readFileSync(fullPath, "utf-8");
    const result = getAllTypeConditionalDeclarations(content);
    if (!result.length) {
      console.log("No conditional type aliases were found.");
      return;
    }
    console.log("Found conditional type aliases:");
    console.log("================================\n");
    console.log(result.join("\n\n"));
  });

program
  .command("ternary-to-fn <file>")
  .description(
    "Convert all type aliases in the file that contain conditional types into function declarations."
  )
  .action((file) => {
    const fullPath = path.resolve(file);
    const content = readFileSync(fullPath, "utf-8");
    const result = ternaryToFn(content);
    if (!result.length) {
      console.log("No conditional type aliases were found in this file.");
      return;
    }
    console.log("// From File: " + fullPath);
    console.log(result.join("\n\n"));
  });

program
  .command("fn-to-ternary <file>")
  .description("Convert all function definitions in the file back into ternary type aliases.")
  .action((file) => {
    const fullPath = path.resolve(file);
    const content = readFileSync(fullPath, "utf-8");
    const result = fnsToTernaries(content);
    if (!result.length) {
      console.log("No valid function definitions found in this file to convert.");
      return;
    }
    console.log(result.join("\n\n"));
  });

program.parse(process.argv);


