import * as vscode from "vscode";
import * as webviewHelper from "./webview";

import WebviewPanelSerializer from "../classes/webview-panel-serializer";
import WebviewViewProvider from "../classes/webview-view-provider";

import CONST_WEBVIEW from "../constants/webview";

import browserWebview from "../webviews/browser";
import changesWebview from "../webviews/changes";

export const startStatusBarItem: vscode.StatusBarItem =
  vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

/**
 * Watch the extension version is changed
 *
 * @param context VS Code context
 * @param outputConsole output console
 */
export function onVersionChanged(
  context: vscode.ExtensionContext,
  outputConsole: vscode.OutputChannel
) {
  const configs = vscode.workspace.getConfiguration("vs-browser");
  let oldVersion = context.globalState.get<string>("version");
  let extensionVersion = context.extension.packageJSON.version;
  let forceShowChanges = false;
  let showUpdateChanges = configs.get("showUpdateChanges");
  if (
    (oldVersion !== extensionVersion && showUpdateChanges) ||
    forceShowChanges
  ) {
    context.globalState.update("version", extensionVersion);
    outputConsole.appendLine("> Extension is updated to " + extensionVersion);
    webviewHelper.createWebviewPanel(changesWebview, context, {
      viewType: "changes",
      title: "VS Browser - New version changes",
      localProxyServerEnabled: false,
      columnToShowIn: "Active",
    });
  }
}

/**
 * Register Serializers for webviews type
 *
 * @param context VS Code context
 */
export function registerWebviewPanelSerializers(
  context: vscode.ExtensionContext
) {
  vscode.window.registerWebviewPanelSerializer(
    "vs-browser.browser",
    new WebviewPanelSerializer(context)
  );
  vscode.window.registerWebviewPanelSerializer(
    "vs-browser.proxy",
    new WebviewPanelSerializer(context)
  );
  vscode.window.registerWebviewPanelSerializer(
    "vs-browser.withoutproxy",
    new WebviewPanelSerializer(context)
  );
}

/**
 * Register Commands
 *
 * @param context VS Code context
 */
export function registerCommands(context: vscode.ExtensionContext) {
  let start = vscode.commands.registerCommand("vs-browser.start", () => {
    // Create and show a new webview
    webviewHelper.createWebviewPanel(
      browserWebview,
      context,
      CONST_WEBVIEW.CONFIG.BASE.BROWSER
    );
  });
  context.subscriptions.push(start);

  // vs-browser.startWithProxy
  let startWithProxy = vscode.commands.registerCommand(
    "vs-browser.startWithProxy",
    () => {
      // Create and show a new webview
      webviewHelper.createWebviewPanel(
        browserWebview,
        context,
        CONST_WEBVIEW.CONFIG.BASE.PROXY
      );
    }
  );
  context.subscriptions.push(startWithProxy);

  // vs-browser.startWithoutProxy
  let startWithoutProxy = vscode.commands.registerCommand(
    "vs-browser.startWithoutProxy",
    () => {
      // Create and show a new webview
      webviewHelper.createWebviewPanel(
        browserWebview,
        context,
        CONST_WEBVIEW.CONFIG.BASE.WITHOUT_PROXY
      );
    }
  );
  context.subscriptions.push(startWithoutProxy);
  // vs-browser.resetViewLocations
  let resetViewLocation = vscode.commands.registerCommand(
    "vs-browser.resetViewLocations",
    () => {
      vscode.commands.executeCommand("vs-browser-browser.resetViewLocation");
      vscode.commands.executeCommand("vs-browser-proxy.resetViewLocation");
      vscode.commands.executeCommand(
        "vs-browser-without-proxy.resetViewLocation"
      );
    }
  );
  context.subscriptions.push(resetViewLocation);

  // 新增: vscode-vs-browser.openUrl 命令
  let openUrl = vscode.commands.registerCommand(
    "vscode-vs-browser.openUrl",
    async () => {
      try {
        const input = await vscode.window.showInputBox({
          prompt: "请输入 URL 或端口号",
          placeHolder: "例如: https://www.google.com 或 3000 或 3000/api/cats",
          ignoreFocusOut: true
        });

        if (input) {
          let url = input.trim();
          const configs = vscode.workspace.getConfiguration("vs-browser");
          const defaultUrl = configs.get<string>("url") || "http://localhost";
          
          // 从默认URL中提取基础地址 (去掉端口号)
          let baseUrl = "http://localhost";
          try {
            const urlObj = new URL(defaultUrl);
            baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          } catch {
            baseUrl = "http://localhost";
          }
          
          // 如果是纯数字，认为是端口号，转换为本地地址
          if (/^\d+$/.test(url)) {
            url = `${baseUrl}:${url}`;
          }
          // 如果是端口号+路径格式 (例如: 3000/api/cats)
          else if (/^\d+\//.test(url)) {
            url = `${baseUrl}:${url}`;
          }
          // 如果不是完整URL，添加协议前缀
          else if (!url.startsWith('http://') && !url.startsWith('https://')) {
            const autoCompleteUrl = configs.get<string>("autoCompleteUrl") || "http://";
            
            if (autoCompleteUrl === "https://www.google.com/search?q=") {
              url = `${autoCompleteUrl}${encodeURIComponent(url)}`;
            } else {
              url = `${autoCompleteUrl}${url}`;
            }
          }

          // 在 VS Code 内部的 webview 中打开URL
          webviewHelper.createWebviewPanel(
            browserWebview,
            context,
            {
              ...CONST_WEBVIEW.CONFIG.BASE.BROWSER,
              url: url,
              title: `VS Browser - ${url}`
            }
          );
          
          vscode.window.showInformationMessage(`已在 VS Browser 中打开: ${url}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`打开URL失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  context.subscriptions.push(openUrl);

  // 新增: vscode-vs-browser.setProxy 命令
  let setProxy = vscode.commands.registerCommand(
    "vscode-vs-browser.setProxy",
    async () => {
      try {
        const currentConfig = vscode.workspace.getConfiguration();
        const currentProxy = currentConfig.get<string>("http.proxy");

        const input = await vscode.window.showInputBox({
          prompt: "请输入代理端口号（留空删除代理设置）",
          placeHolder: "例如: 8080",
          value: currentProxy ? extractPortFromProxy(currentProxy) : "",
          ignoreFocusOut: true
        });

        if (input !== undefined) {
          let proxyUrl = "";
          
          if (input.trim()) {
            const port = input.trim();
            // 验证端口号是否有效
            if (!/^\d+$/.test(port) || parseInt(port) < 1 || parseInt(port) > 65535) {
              vscode.window.showErrorMessage("请输入有效的端口号（1-65535）");
              return;
            }
            proxyUrl = `http://127.0.0.1:${port}`;
          }

          // 更新用户配置（http.proxy 只能设置在用户级别）
          await currentConfig.update(
            "http.proxy",
            proxyUrl || undefined,
            vscode.ConfigurationTarget.Global
          );

          if (proxyUrl) {
            vscode.window.showInformationMessage(`代理已设置为: ${proxyUrl}`);
          } else {
            vscode.window.showInformationMessage("代理设置已清除");
          }
        }
      } catch (error) {
        vscode.window.showErrorMessage(`设置代理失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  context.subscriptions.push(setProxy);

  // 新增: vscode-vs-browser.setDefaultUrl 命令
  let setDefaultUrl = vscode.commands.registerCommand(
    "vscode-vs-browser.setDefaultUrl",
    async () => {
      try {
        const currentConfig = vscode.workspace.getConfiguration("vs-browser");
        const currentUrl = currentConfig.get<string>("url") || "http://localhost";

        const input = await vscode.window.showInputBox({
          prompt: "请输入默认URL",
          placeHolder: "例如: http://localhost:8080 或 https://example.com",
          value: currentUrl,
          ignoreFocusOut: true
        });

        if (input !== undefined && input.trim()) {
          let url = input.trim();
          
          // 如果不包含协议，自动添加 http://
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `http://${url}`;
          }

          // 验证URL格式
          try {
            new URL(url);
          } catch {
            vscode.window.showErrorMessage("请输入有效的URL格式");
            return;
          }

          // 更新配置
          await currentConfig.update(
            "url",
            url,
            vscode.ConfigurationTarget.Global
          );
          
          vscode.window.showInformationMessage(`默认URL已设置为: ${url}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`设置默认URL失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  context.subscriptions.push(setDefaultUrl);

  // 新增: vs-browser.openLink 命令 - 右键菜单支持
  let openLink = vscode.commands.registerCommand(
    "vs-browser.openLink",
    async (uri?: vscode.Uri) => {
      try {
        let urlToOpen: string | undefined;
        
        // 1. 如果是从资源管理器调用（有 uri 参数）
        if (uri && uri.scheme === 'file') {
          // 如果是 HTML 文件，使用 file:// 协议打开
          if (uri.fsPath.endsWith('.html') || uri.fsPath.endsWith('.htm')) {
            urlToOpen = uri.toString();
          }
        } 
        // 2. 如果是从编辑器调用（没有 uri 参数）
        else {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showErrorMessage('请先选中要打开的文本');
            return;
          }
          
          const selection = editor.selection;
          const selectedText = editor.document.getText(selection).trim();
          
          if (!selectedText) {
            vscode.window.showErrorMessage('请先选中要打开的文本');
            return;
          }
          
          // 处理选中的文本
          const configs = vscode.workspace.getConfiguration("vs-browser");
          const defaultUrl = configs.get<string>("url") || "http://localhost";
          
          // 从默认URL中提取基础地址
          let baseUrl = "http://localhost";
          try {
            const urlObj = new URL(defaultUrl);
            baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
          } catch {
            baseUrl = "http://localhost";
          }
          
          // 判断选中的文本类型
          if (/^\d+$/.test(selectedText)) {
            // 纯数字，认为是端口号
            urlToOpen = `${baseUrl}:${selectedText}`;
          } else if (/^\d+\//.test(selectedText)) {
            // 端口号+路径格式
            urlToOpen = `${baseUrl}:${selectedText}`;
          } else if (/^https?:\/\//i.test(selectedText)) {
            // 完整的 URL
            urlToOpen = selectedText;
          } else if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/.*)?$/i.test(selectedText)) {
            // 域名格式（如 example.com 或 example.com/path）
            urlToOpen = `http://${selectedText}`;
          } else {
            // 其他情况，尝试作为搜索词
            const autoCompleteUrl = configs.get<string>("autoCompleteUrl") || "http://";
            if (autoCompleteUrl === "https://www.google.com/search?q=") {
              urlToOpen = `${autoCompleteUrl}${encodeURIComponent(selectedText)}`;
            } else {
              urlToOpen = `${autoCompleteUrl}${selectedText}`;
            }
          }
        }
        
        if (urlToOpen) {
          // 在 VS Browser 中打开
          webviewHelper.createWebviewPanel(
            browserWebview,
            context,
            {
              ...CONST_WEBVIEW.CONFIG.BASE.BROWSER,
              url: urlToOpen,
              title: `VS Browser - ${urlToOpen}`
            }
          );
          
          vscode.window.showInformationMessage(`已在 VS Browser 中打开: ${urlToOpen}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(`打开链接失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  context.subscriptions.push(openLink);
}

/**
 * Register Status bar items
 *
 * @param context VS Code context
 */
export function registerStatusBarItems(context: vscode.ExtensionContext) {
  // register a new status bar item that we can now manage
  const configs = vscode.workspace.getConfiguration("vs-browser");
  let showStatusBarItem = configs.get<boolean>("showStatusBarItem") || false;
  startStatusBarItem.command = "vs-browser.start";
  startStatusBarItem.text = "$(globe) VS Browser";
  startStatusBarItem.tooltip = "Start VS Browser";
  context.subscriptions.push(startStatusBarItem);
  if (showStatusBarItem) {
    startStatusBarItem.show();
  }
  // show/hide status bar item when config changed
  vscode.workspace.onDidChangeConfiguration(() => {
    const configs = vscode.workspace.getConfiguration("vs-browser");
    showStatusBarItem = configs.get<boolean>("showStatusBarItem") || false;
    if (!showStatusBarItem) {
      startStatusBarItem.hide();
    } else {
      startStatusBarItem.show();
    }
  });
}

/**
 * Register View Container
 *
 * @param context VS Code context
 */
export function registerViewContainer(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "vs-browser-browser",
      new WebviewViewProvider(
        browserWebview,
        context,
        CONST_WEBVIEW.CONFIG.BASE.BROWSER
      )
    )
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "vs-browser-proxy",
      new WebviewViewProvider(
        browserWebview,
        context,
        CONST_WEBVIEW.CONFIG.BASE.PROXY
      )
    )
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "vs-browser-without-proxy",
      new WebviewViewProvider(
        browserWebview,
        context,
        CONST_WEBVIEW.CONFIG.BASE.WITHOUT_PROXY
      )
    )
  );
}

/**
 * Handle when the configuration change
 *
 * @param event An event describing the change in Configuration
 */
export function handleConfigurationChange(
  event: vscode.ConfigurationChangeEvent
) {
  const configs = vscode.workspace.getConfiguration("vs-browser");
  if (event.affectsConfiguration("vs-browser.showViewContainer")) {
    updateContextKey();
  } else if (event.affectsConfiguration("vs-browser.showStatusBarItem")) {
    const showStatusBarItem = configs.get<boolean>("showStatusBarItem");
    if (!showStatusBarItem) {
      startStatusBarItem.hide();
    } else {
      startStatusBarItem.show();
    }
  }
}

/**
 * Update VS Code context key to use when in package.json
 */
export function updateContextKey() {
  const configs = vscode.workspace.getConfiguration("vs-browser");
  const showViewContainer = configs.get<boolean>("showViewContainer");

  vscode.commands.executeCommand(
    "setContext",
    "config.vs-browser.showViewContainer",
    showViewContainer
  );
}

/**
 * 从代理URL中提取端口号
 * @param proxyUrl 代理URL字符串
 * @returns 端口号字符串
 */
function extractPortFromProxy(proxyUrl: string): string {
  try {
    const url = new URL(proxyUrl);
    return url.port || "";
  } catch {
    return "";
  }
}
