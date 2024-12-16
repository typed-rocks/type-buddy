// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { fnsToTernaries, getAllTypeConditionalDeclarations, ternaryToFn } from "./agnostic";
import { Project } from "ts-morph";

const customType = "typeBuddyCustomTs";

function createWebview(content: string, title: string, col: number): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel("typeBuddy", "Type Buddy: " + title, col, {
    enableScripts: true,
  });

  panel.webview.html = getWebviewContent(content);
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
    fnWebview = createWebview("", "Function Preview", vscode.ViewColumn.Beside);
    fnWebview.onDidDispose(() => (fnWebview = undefined));
    return fnWebview;
  }

  function typeWebViewPanel(): vscode.WebviewPanel {
    if (typeWebview) {
      return typeWebview;
    }
    typeWebview = createWebview('', "Type Preview", vscode.ViewColumn.Beside);
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
	context.subscriptions.push(changeTextDocumentDisposable);


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
    post(`Type Preview for: ${title}`, typeWebViewPanel().webview, () => fnsToTernaries(newText).join("\n\n"));
  }

  function post(title: string, webview: vscode.Webview, fn: () => string) {
    try {
      const result = fn();
      webview.postMessage({ title, text: escapeHTML(result) });
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

function escapeHTML(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getWebviewContent(content: string): string {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
		<style>
			.scroll-container {
			overflow-x: auto;
			width: 100%;
			}

      pre {
      font-size: 1.2rem;
      }
	
		</style>
  </head>
  <body>
    <h2 id="title"></h2>
		<div class="scroll-container">
    <pre id="content">${content}</pre>
		</div>
    <script>
      const vscode = acquireVsCodeApi();
      window.addEventListener('message', event => {
        const message = event.data; 
				document.getElementById('title').textContent = message.title;
        document.getElementById('content').innerHTML = message.text;
      });
    </script>
  </body>
  </html>`;
}
