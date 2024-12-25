// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { fnsToTernaries, getAllTypeConditionalDeclarations, ternaryToFn } from "./agnostic";
import { Project } from "ts-morph";

import hljs from 'highlight.js';
import path from "path";
import { writeFileSync } from "fs";



const customType = "typeBuddyCustomTs";

function createWebview(title: string, col: number): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel("typeBuddy", "Type Buddy: " + title, col, {
    enableScripts: true,
  });
  const fontSize = vscode.workspace.getConfiguration('editor').get<number>('fontSize');
  const strFontSize = fontSize ? fontSize + 'px' : '1.3rem';
  panel.webview.html = getWebviewContent(strFontSize);
  return panel;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let typeWebview: vscode.WebviewPanel | undefined;
  let fnWebview: vscode.WebviewPanel | undefined;

  function fnWebViewPanel(): vscode.WebviewPanel {
    if (fnWebview) {
      return fnWebview;
    }
    fnWebview = createWebview("Function Preview", vscode.ViewColumn.Beside);
    fnWebview.onDidDispose(() => (fnWebview = undefined));
    return fnWebview;
  }

  function typeWebViewPanel(): vscode.WebviewPanel {
    if (typeWebview) {
      return typeWebview;
    }
    typeWebview = createWebview("Type Preview", vscode.ViewColumn.Beside);
    typeWebview.onDidDispose(() => (typeWebview = undefined));
    return typeWebview;
  }

	// Commands
  const showTypeFn = vscode.commands.registerCommand("type-buddy.showFunctionTypes", async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found");
      return;
    }
    const text = editor.document.getText();
    const fileName = editor.document.fileName;
    fnWebViewPanel();
    updateFnText(fileName, text);
  });
	context.subscriptions.push(showTypeFn);


	const openViewerCommand = vscode.commands.registerCommand("type-buddy.openViewer", async () => {
    const currentFileName = vscode.window.activeTextEditor?.document.fileName;
    const isTbFileOpened = currentFileName?.endsWith(".tb");
    typeWebViewPanel();
    if (isTbFileOpened) {
      updateTypeText(currentFileName!, vscode.window.activeTextEditor?.document.getText()!);
    }
  });
	context.subscriptions.push(openViewerCommand);

	const openEditorCommandDisposable = vscode.commands.registerCommand(
    "type-buddy.openEditor",
    async (encodedType: string) => {
      const type = decodeURIComponent(encodedType || "");
      createEditor(type);
      typeWebViewPanel();
      updateTypeText("", type);
    }
	);
  context.subscriptions.push(openEditorCommandDisposable);

  const hoverProvider = vscode.languages.registerHoverProvider("typescript", {
    provideHover(document, position) {
      const range = document.getWordRangeAtPosition(position, /\w+/);
      if (!range) {
        return null;
      }
      const word = document.getText(range);

      const typeAlias = new Project().createSourceFile("temp.ts", document.getText())?.getTypeAlias(word);

      if (!typeAlias) {
        return null;
      }

      const resolvedType = ternaryToFn(typeAlias.getText()).join("\n");

      const encodedType = encodeURIComponent(JSON.stringify([resolvedType]));
      const md = `[Open in Type Buddy Editor](command:type-buddy.openEditor?${encodedType})\n \`\`\`ts  \n${resolvedType}\n  \`\`\``;
      const markdownString = new vscode.MarkdownString(md);
      markdownString.isTrusted = true;
      return new vscode.Hover(markdownString);
    },
  });

  context.subscriptions.push(hoverProvider);

  const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => updateViews(editor));
	context.subscriptions.push(editorChangeDisposable);

  const changeTextDocumentDisposable = vscode.workspace.onDidChangeTextDocument((event) => updateViews(event));
  const saveTextDocumentDisposable = vscode.workspace.onDidSaveTextDocument((event) => {
    const fileName = event.fileName;
    if(fileName.endsWith(".tb")) {
      const dir = path.dirname(fileName);
      const basename = path.basename(fileName);
      const dtsFileName = path.resolve(dir, basename + '.d.ts');
      const newText = fnsToTernaries(event.getText());
      writeFileSync(dtsFileName, newText);
    }
  });
  
	context.subscriptions.push(changeTextDocumentDisposable);
  context.subscriptions.push(saveTextDocumentDisposable);
  function extractFileName(fileName?: string) {
    const parts = fileName?.split("/");
    return parts ? parts[parts.length - 1] : "Untitled";
  }

  function updateViews(event: vscode.TextDocumentChangeEvent | vscode.TextEditor | undefined) {
    if (!event?.document) {
      return;
    }
    const document = event.document;
    const isCustomTs = document.languageId === customType;
    const fileName = document.fileName;
    if (typeWebview) {
      if (isCustomTs) {
        updateTypeText(fileName, document.getText());
      } else {
        updateTypeText("Types Not Available", "");
      }
    }
    if (fnWebview) {
      if (document.languageId === "typescript") {
        updateFnText(fileName, document.getText());
      } else {
        updateFnText("Functions Not available", "");
      }
    }
  }

  async function createEditor(content: string) {
    const doc = await vscode.workspace.openTextDocument({
      language: customType,
      content,
    });
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  }


  function updateTypeText(title: string, newText: string) {
    const fileName = extractFileName(title);
    
    post(`Type Preview for: ${fileName}`, typeWebViewPanel().webview, () => fnsToTernaries(newText));
  }

  
  function post(title: string, webview: vscode.Webview, fn: () => string) {
    try {
      const result = fn();
      
      const code = `<pre><code class="hljs language-typescript">` +
                        hljs.highlight(result, { language: 'typescript', ignoreIllegals: true }).value +
                        '</code></pre>';
      webview.postMessage({ title, text: code });
    } catch (e) {
      webview.postMessage({ title, text: (e as Error).message });
    }
  }

  function updateFnText(fileName: string, newText: string) {
    post(`Function Preview for: ${fileName}`, fnWebViewPanel().webview, () =>
      getAllTypeConditionalDeclarations(newText)
        .map((fn) => ternaryToFn(fn).join("\n"))
        .join("\n\n")
    );
  }
}

export function deactivate() {}


function getWebviewContent(fontsize: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Markdown Info</title>
		<style>

      ${css};
			.scroll-container {
			overflow-x: auto;
			width: 100%;
			}

      pre {
      font-size: ${fontsize};
      }
	
		</style>
  </head>
  <body>
    <h2 id="title"></h2>
		<div class="scroll-container">
     <div id="code"></div>
		</div>
    <script>
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', event => {
        const message = event.data; 
				document.getElementById('title').textContent = message.title;
        document.getElementById('code').innerHTML = message.text;
      });
    </script>
  </body>
  </html>`;
}

const css = `.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;

  color: #c9d1d9;
  background: #0d1117;
}

.hljs-comment,
.hljs-punctuation {
  color: #8b949e;
}

.hljs-attr,
.hljs-attribute,
.hljs-meta,
.hljs-selector-attr,
.hljs-selector-class,
.hljs-selector-id {
  color: #79c0ff;
}

.hljs-variable,
.hljs-literal,
.hljs-number,
.hljs-doctag {
  color: #ffa657;
}

.hljs-params {
  color: #c9d1d9;
}

.hljs-function {
  color: #d2a8ff;
}

.hljs-class,
.hljs-tag,
.hljs-title,
.hljs-built_in {
  color: #7ee787;
}

.hljs-keyword,
.hljs-type,
.hljs-builtin-name,
.hljs-meta-keyword,
.hljs-template-tag,
.hljs-template-variable {
  color: #ff7b72;
}

.hljs-string,
.hljs-undefined {
  color: #a5d6ff;
}

.hljs-regexp {
  color: #a5d6ff;
}

.hljs-symbol {
  color: #79c0ff;
}

.hljs-bullet {
  color: #ffa657;
}

.hljs-section {
  color: #79c0ff;
  font-weight: bold;
}

.hljs-quote,
.hljs-name,
.hljs-selector-tag,
.hljs-selector-pseudo {
  color: #7ee787;
}

.hljs-emphasis {
  color: #ffa657;
  font-style: italic;
}

.hljs-strong {
  color: #ffa657;
  font-weight: bold;
}

.hljs-deletion {
  color: #ffa198;
  background-color: #490202;
}

.hljs-addition {
  color: #7ee787;
  background-color: #04260f;
}

.hljs-link {
  color: #a5d6ff;
  font-style: underline;
}
`;