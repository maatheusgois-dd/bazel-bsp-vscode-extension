// Mock VSCode API for testing
const vscode = {
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace' },
        name: 'MockWorkspace',
        index: 0,
      },
    ],
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
    onDidChangeConfiguration: jest.fn(),
  },
  window: {
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn(),
    })),
    showQuickPick: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    withProgress: jest.fn((options, task) => task({ report: jest.fn() }, { onCancellationRequested: jest.fn() })),
    createStatusBarItem: jest.fn(() => ({
      text: '',
      tooltip: '',
      command: '',
      show: jest.fn(),
      hide: jest.fn(),
      dispose: jest.fn(),
    })),
    registerTreeDataProvider: jest.fn(),
    terminals: [],
  },
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  tasks: {
    registerTaskProvider: jest.fn(),
    executeTask: jest.fn(),
    onDidEndTaskProcess: jest.fn(),
    taskExecutions: [],
  },
  debug: {
    registerDebugConfigurationProvider: jest.fn(),
    startDebugging: jest.fn(),
    stopDebugging: jest.fn(),
    activeDebugSession: null,
  },
  Uri: {
    file: jest.fn((path) => ({ fsPath: path })),
    parse: jest.fn((uri) => ({ fsPath: uri })),
  },
  env: {
    openExternal: jest.fn(),
  },
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn(),
  })),
  TreeItem: jest.fn(),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  TaskScope: {
    Global: 1,
    Workspace: 2,
  },
  ThemeIcon: jest.fn((id) => ({ id })),
  QuickPickItemKind: {
    Separator: -1,
    Default: 0,
  },
  ProgressLocation: {
    SourceControl: 1,
    Window: 10,
    Notification: 15,
  },
  Task: jest.fn(),
  ShellExecution: jest.fn(),
  CustomExecution: jest.fn(),
  TaskRevealKind: {
    Always: 1,
    Silent: 2,
    Never: 3,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  DebugConfigurationProviderTriggerKind: {
    Initial: 1,
    Dynamic: 2,
  },
  ExtensionContext: jest.fn(),
};

module.exports = vscode;

