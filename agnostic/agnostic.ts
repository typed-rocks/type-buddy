import {
  Block,
  FunctionDeclaration,
  IfStatement,
  Node,
  Project,
  ScriptTarget,
  Statement,
  ts
} from "ts-morph";
import ModuleResolutionKind = ts.ModuleResolutionKind;
import SyntaxKind = ts.SyntaxKind;

export function ternaryToFn(input: string): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      moduleResolution: ModuleResolutionKind.NodeNext,
      target: ScriptTarget.ESNext,
    },
  });

  const sourceFile = project.createSourceFile("thepath.ts", input);

  const allTypeAliases = sourceFile
    .getTypeAliases()
    .filter((alias) => !!alias.getFirstDescendantByKind(SyntaxKind.ConditionalType));

  return allTypeAliases.map((alias) => {
    const store = [];
    const name = alias.getName();
    const args = alias
      .getTypeParameters()
      .map((p) => p.getText())
      .join(", ");
    store.push(`function ${name}(${args}) {\n`);
    const root = alias.getFirstDescendantByKindOrThrow(SyntaxKind.ConditionalType);
    traverseTernary(root, store);
    store.push("\n}");
    const joined = store.join("").split("\n");
    return indentLines(joined, "{", "}").join("\n");
  });
}

export function indentLines(lines: string[], open: string, close: string): string[] {
  let indentLevel = 0;
  const indentedLines: string[] = [];

  // A simple helper to trim and detect braces that are at top-level of a line (not offset by code)
  const topLevelHasOpeningBrace = (line: string) => line.trim().endsWith(open);
  const topLevelHasClosingBrace = (line: string) => line.trim().startsWith(close);

  for (const line of lines) {
    const trimmed = line.trim();

    // If this line starts with a closing brace '}', reduce indentation first
    if (topLevelHasClosingBrace(trimmed)) {
      indentLevel = Math.max(0, indentLevel - 1);
    }

    // Apply indentation
    const currentIndent = " ".repeat(indentLevel * 2);
    indentedLines.push(currentIndent + trimmed);

    // If line ends with an opening brace '{', increase indentation after printing
    if (topLevelHasOpeningBrace(trimmed)) {
      indentLevel++;
    }
  }

  return indentedLines;
}

export function getAllTypeConditionalDeclarations(input: string): string[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      moduleResolution: ModuleResolutionKind.NodeNext,
      target: ScriptTarget.ESNext,
    },
  });

  const sourceFile = project.createSourceFile("thepath.ts", input);

  const allTypeAliases = sourceFile
    .getTypeAliases()
    .filter((alias) => !!alias.getFirstDescendantByKind(SyntaxKind.ConditionalType));

  return allTypeAliases.map((alias) => alias.getText());
}

function unwrapParenthesizedType(node: Node | undefined): Node {
  if (node === undefined) {
    throw new Error("Node is undefined");
  }
  if (node?.isKind(SyntaxKind.ParenthesizedType)) {
    return unwrapParenthesizedType(node.getFirstChildByKind(SyntaxKind.ConditionalType));
  }
  return node;
}

function traverseTernary(node: Node | undefined, store: string[]) {
  node = unwrapParenthesizedType(node);
  if (node.isKind(SyntaxKind.ConditionalType)) {
    const extend = node.getExtendsType();
    const checkType = node.getCheckType();
    const ifType = unwrapParenthesizedType(node.getTrueType());
    const elseType = unwrapParenthesizedType(node.getFalseType());
    const ifValue = `if(${checkType.getText()} extends ${extend.getText()}) {\n`;
    store.push(ifValue);
    traverseTernary(ifType, store);
    const elseIsConditional = elseType.isKind(SyntaxKind.ConditionalType);
    if (elseIsConditional) {
      store.push("\n} else ");
      traverseTernary(elseType, store);
    } else {
      store.push(`\n} else {\nreturn ${elseType.getText()};\n}`);
    }
  } else {
    store.push(`return ${node.getText()};`);
  }
}

const ifRegex = /(^.*if\s*\()/;
const functionRegex = /^.*function\s*\w+\s*\((.*)\)\s*{\s*/;

function splitOnFunctions(code: string) {
  const lines = code.split("\n");
  const fns: string[] = [];
  let currentFn: string[] = [];

  lines
    .filter((l) => l.trim().length)
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("function")) {
        if (currentFn.length) {
          fns.push(currentFn.join("\n"));
        }
        currentFn = [line];
      } else {
        currentFn.push(line);
      }
    });
  if (currentFn.length) {
    fns.push(currentFn.join("\n"));
  }
  return fns;
}

export function fnsToTernaries(code: string): string[] {
  return splitOnFunctions(code).map((fn) => fnToTernary(fn));
}

function fnToTernary(inputFn: string): string {
  const project = new Project({
    useInMemoryFileSystem: true,
  });
  const replaced = replaceIfBlockValuesWithString(inputFn);
  const workingFn = replaced.workingLines.join("\n");
  const sourceFile = project.createSourceFile("thepath.ts", workingFn);
  const fn = sourceFile.getFirstDescendantByKind(SyntaxKind.FunctionDeclaration);
  if (!fn) {
    throw new Error(`No valid function was found. A function has to look something like this: 
      function A(B extends string, C) {

      }
      `);
  }
  let ternary = transformFnToTernary(fn);
  for (const replacement of replaced.replacements) {
    ternary = ternary.replace(replacement.index, replacement.backReplace);
  }
  return ternary;
}

function replaceIfBlockValuesWithString(code: string) {
  const lines = code.split("\n");

  const workingLines: string[] = [];
  const replacements: { index: string; backReplace: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matched = line.match(ifRegex);
    const fnMatched = line.match(functionRegex);
    const replaceValue = `"${i}_replace"`;
    if (fnMatched?.length) {
      const fixeds = replaceArgumentsWithFixed(fnMatched[1]);
      const fnIndexStart = line.indexOf("function") + "function".length;
      const fnIndexEnd = line.indexOf("(");
      const fnName = line.substring(fnIndexStart, fnIndexEnd).trim();
      const fixedLine = `function ${fnName}(${fixeds.map((f) => f.fixedLine).join(", ")}) {`;
      workingLines.push(fixedLine);
      replacements.push(...fixeds.map((f) => ({index: f.fixedLine, backReplace: f.condition})));
    } else if (matched?.length) {
      const fixedLine = replaceConditionWithFixed(line, matched[0], replaceValue);
      workingLines.push(fixedLine.fixedLine);
      replacements.push({index: replaceValue, backReplace: fixedLine.condition});
    } else if (line.match(/^\s*return/)) {
      const fixedLine = replaceReturnWithFixed(line, replaceValue);
      workingLines.push(fixedLine.fixedLine);
      replacements.push({index: replaceValue, backReplace: fixedLine.condition});
    } else {
      workingLines.push(line);
    }
  }
  return {workingLines, replacements};
}

function replaceArgumentsWithFixed(args: string): {
  fixedLine: string;
  condition: string;
}[] {
  const splitArgs = args.split(",");
  return splitArgs.map((arg, i) => {
    return {condition: arg, fixedLine: `replace${i}`};
  });
}

function replaceReturnWithFixed(
  line: string,
  fixed: string
): {
  fixedLine: string;
  condition: string;
} {
  const returnStr = "return ";
  const conditionStartIndex = line.indexOf(returnStr);
  const endIndex = line.endsWith(";") ? line.length - 1 : line.length;
  const condition = line.substring(conditionStartIndex + returnStr.length, endIndex);
  return {condition, fixedLine: line.replace(condition, fixed)};
}

function replaceConditionWithFixed(
  line: string,
  prefix: string,
  fixed: string
): {
  fixedLine: string;
  condition: string;
} {
  const conditionStartIndex = line.indexOf(prefix);
  const conditionEndIndex = line.lastIndexOf(")");
  const condition = line.substring(conditionStartIndex + prefix.length, conditionEndIndex);
  return {condition, fixedLine: line.replace(condition, fixed)};
}

function transformFnToTernary(func: FunctionDeclaration) {
  // Find the top-level if statement in the function body
  const ifStatement = func.getBody()?.getFirstDescendantByKind(SyntaxKind.IfStatement);
  if (!ifStatement) {
    throw new Error("No if statement found.");
  }
  const ternaryExpr = transformIfStatementToTernary(ifStatement, 2);

  const fnName = func.getName();
  const fnParameters = func
    .getParameters()
    .map((p) => p.getText().trim())
    .join(",");
  return `type ${fnName}<${fnParameters}> =\n  ${ternaryExpr};`;
}

function handleBlock(block: Block, indent: number) {
  const innerStmts = block.getStatements();
  const message = "There needs to be a EXACTLY ONE return inside of if, else if or else blocks. NOTHING else.\nLine: " +
    block.getStartLineNumber();
  if (innerStmts.length !== 1) {
    throw new Error(message);
  }
  const onlyStatement = innerStmts[0];
  if (onlyStatement.isKind(SyntaxKind.ReturnStatement)) {
    const returnExpr = onlyStatement.getExpression();
    if (returnExpr) {
      return returnExpr.getText();
    }
    throw new Error(message);
  } else if (onlyStatement.isKind(SyntaxKind.IfStatement)) {
    // Nested if
    return transformIfStatementToTernary(onlyStatement, indent + 1);
  } else {
    // If there's more complexity here, you'd need more logic.
    throw new Error("Expected a single return or a nested if in the block. \nLine: " + block.getEndLineNumber());
  }
}

/**
 * Extracts a return expression from a block that must contain a single return statement.
 * If the block contains nested ifs, we will process them recursively.
 */
function getBlockReturnExpression(block: Statement, indent: number): string {
  if (block.isKind(SyntaxKind.Block)) {
    return handleBlock(block, indent);
  } else if (block.isKind(SyntaxKind.ReturnStatement)) {
    // Direct return, no block
    const returnExpr = block.getExpression()?.getText();
    return returnExpr?.length ? returnExpr : "never";
  } else if (block.isKind(SyntaxKind.IfStatement)) {
    // Direct nested if without a block
    return transformIfStatementToTernary(block, indent + 1);
  } else if (block.getChildren().length) {
    throw new Error(
      "There needs to be a EXACTLY ONE return inside of if, else if or else blocks. NOTHING else.\nLine: " +
      block.getStartLineNumber()
    );
  }
  return 'never';
}

function noElseBlock(ifStmt: IfStatement, indentation: string, thenExpr: string) {
  const conditionText = ifStmt.getExpression().getText();
  const noSibling = !ifStmt.getNextSiblings().length;
  const oneNextSibling = ifStmt.getNextSiblings().length === 1;
  const isSiblingReturn = ifStmt.getNextSibling()?.isKind(SyntaxKind.ReturnStatement);
  if (oneNextSibling && isSiblingReturn) {
    const returnExpr = ifStmt.getNextSibling()!.asKindOrThrow(SyntaxKind.ReturnStatement).getExpression();
    return `${conditionText}\n${indentation}? ${thenExpr}\n${indentation}: ${returnExpr?.getText()}`;
  } else if (noSibling) {
    return `${conditionText}\n${indentation}? ${thenExpr}\n${indentation}: never`;
  } else {
    throw new Error("There needs to be a EXACTLY ONE return inside of \n//if, else if or else blocks. NOTHING else.\n//Line: " + ifStmt.getEndLineNumber());
  }
}

/**
 * Recursively transform an IfStatement (with else/else if) into a ternary expression string.
 */
function transformIfStatementToTernary(ifStmt: IfStatement, indent: number): string {
  const indentation = " ".repeat(indent * 2);
  const conditionText = ifStmt.getExpression().getText();
  const thenBranch = ifStmt.getThenStatement();
  const elseBranch = ifStmt.getElseStatement();
  const thenExpr = getBlockReturnExpression(thenBranch, indent);


  if (!elseBranch) {
    return noElseBlock(ifStmt, indentation, thenExpr);
  }
  let elseExpr: string;
  if (elseBranch.isKind(SyntaxKind.IfStatement)) {
    // else if scenario
    elseExpr = transformIfStatementToTernary(elseBranch, indent + 1);
  } else {
    // else scenario with a final return or nested if in a block
    elseExpr = getBlockReturnExpression(elseBranch, indent);
  }
  return `${conditionText}\n${indentation}? ${thenExpr}\n${indentation}: ${elseExpr}`;
}
