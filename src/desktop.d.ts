interface SchemaFile { path: string; name: string; text: string }

interface VdooDesktop {
  pendingFile(): Promise<SchemaFile | null>;
  open(): Promise<SchemaFile | null>;
  save(request: { text: string; file?: string | null; suggestedName: string; kind: "vdoo" | "mermaid" | "sql" | "svg" }): Promise<{ path: string; name: string } | null>;
  openLink(url: string): Promise<void>;
  close(): Promise<void>;
  onOpenFile(callback: (file: SchemaFile) => void): () => void;
  onCloseRequested(callback: () => void): () => void;
  ai: VdooAi;
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

interface Window {
  vdooDesktop?: VdooDesktop;
}
