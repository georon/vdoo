interface SchemaFile { path: string; name: string; text: string }

interface VdooDesktop {
  pendingFile(): Promise<SchemaFile | null>;
  save(request: { text: string; file?: string | null; suggestedName: string; kind: "vdoo" | "vdooapp" | "mermaid" | "sql" | "svg" }): Promise<{ path: string; name: string } | null>;
  openLink(url: string): Promise<void>;
  close(): Promise<void>;
  /** View › Theme: the window frame and native controls follow it (Electron's nativeTheme). */
  setTheme(theme: "system" | "light" | "dark"): Promise<void>;
  onOpenFile(callback: (file: SchemaFile) => void): () => void;
  onCloseRequested(callback: () => void): () => void;
  /** Runs an Edit menu command on whatever has the focus. */
  edit(command: EditCommand): Promise<void>;
  /** Renders a self-contained HTML page to PDF and saves it where the user picks. Null when the dialog is cancelled. */
  exportPdf(request: { html: string; suggestedName: string }): Promise<{ path: string; name: string } | null>;
  /** Writes a generated Odoo addon as the folder `name` inside a directory the user picks. Null when cancelled. */
  exportAddon(request: { name: string; files: { path: string; content: string }[] }): Promise<{ path: string; count: number } | null>;
  files: VdooFiles;
  ai: VdooAi;
  odoo: VdooOdoo;
}

type EditCommand = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";

interface DirEntry { name: string; path: string; isDir: boolean }

/** Only folders and files the user picked in a dialog can be listed, read or written. */
interface VdooFiles {
  /** The folder that was open last time, if it still exists. */
  workspace(): Promise<string | null>;
  chooseFolder(): Promise<string | null>;
  list(dir: string): Promise<DirEntry[]>;
  /** Shows the Open dialog; returns the chosen paths (none when cancelled). */
  pick(): Promise<string[]>;
  read(file: string): Promise<SchemaFile | { error: string }>;
  /** Saves to `file`, or asks where when there is none. Null when the dialog is cancelled. */
  write(request: { text: string; file?: string | null; suggestedName: string }): Promise<{ path: string; name: string } | null>;
  /** Where the Open and Save dialogs start (Settings › Default directory), or null when not set. */
  defaultDir(): Promise<string | null>;
  /** Asks for the default directory; returns the one now in effect (unchanged when cancelled). */
  chooseDefaultDir(): Promise<string | null>;
  clearDefaultDir(): Promise<null>;
}

interface AiStatus {
  custom: CustomEndpointStatus;
  chatgpt: { connected: boolean; email: string; name: string; welcomeSeen: boolean; encrypted: boolean };
  claude: { installed: boolean; loggedIn: boolean; version?: string; subscription?: boolean; authMethod?: string };
}

interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiEvent {
  id: string;
  type: "delta" | "done" | "error";
  text?: string;
  message?: string;
  code?: string;
  link?: string;
}

interface VdooAi {
  status(): Promise<AiStatus>;
  signInChatGPT(): Promise<{ ok: boolean; status?: AiStatus["chatgpt"]; error?: string }>;
  signOutChatGPT(): Promise<AiStatus["chatgpt"]>;
  chatgptWelcomeSeen(): Promise<boolean>;
  chatgptModels(): Promise<{ ok: boolean; models?: { id: string; name: string }[]; error?: string; code?: string }>;
  recheckClaude(): Promise<AiStatus["claude"]>;
  customEndpoint(action: "save" | "check" | "remove", input?: { baseUrl: string; key: string }): Promise<{ ok: boolean; status?: CustomEndpointStatus; error?: string }>;
  customModels(): Promise<{ ok: boolean; models?: ProviderModel[]; error?: string }>;
  ask(request: { id: string; provider: "chatgpt" | "claude" | "custom"; model: string; document: { name: string; text: string; truncated: boolean; recognized: boolean };
    messages: AiMessage[] }): Promise<boolean>;
  cancel(id: string): Promise<boolean>;
  onEvent(callback: (event: AiEvent) => void): () => void;
}

interface ProviderModel { id: string; name: string; contextLength: number | null }

interface CustomEndpointStatus { configured: boolean; baseUrl: string; hasKey: boolean }

interface OdooStatus { configured: boolean; url: string; user: string; database: string }

/** What the server reported after a sign-in. */
interface OdooConnection { version: string; database: string; user: string; login: string; uid: number; isAdmin: boolean }

interface VdooOdoo {
  status(): Promise<OdooStatus>;
  /** An empty user means admin; an empty database means the server's only one. */
  save(input: { url: string; user: string; database: string }): Promise<{ ok: boolean; status?: OdooStatus; error?: string }>;
  /** Signs in with the saved URL and user. The password is used for this call and not kept. */
  connect(password: string): Promise<{ ok: boolean; connection?: OdooConnection; error?: string }>;
}

interface Window {
  vdooDesktop?: VdooDesktop;
}
