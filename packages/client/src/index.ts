/**
 * @just-inspector/client — browser-safe entry.
 * Re-exports the protocol and the core client plus the browser transport.
 * (Node and VS Code webview transports live in ./node and ./vscode-webview.)
 */

export * from "@just-inspector/protocol";
export * from "./transport";
export * from "./inspector-client";
export * from "./browser-transport";
