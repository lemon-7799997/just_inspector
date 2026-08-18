import * as vscode from "vscode";
import { InspectorWebviewProvider } from "./inspector-webview";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new InspectorWebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(InspectorWebviewProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("justInspector.open", () => {
      void vscode.commands.executeCommand(`${InspectorWebviewProvider.viewType}.focus`);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("justInspector")) {
        provider.pushConfig();
      }
    }),
  );
}

export function deactivate(): void {
  /* provider is disposed through the extension context */
}
