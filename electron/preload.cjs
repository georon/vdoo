// Minimal bridge between the vdoo page and the desktop shell.
const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("vdooDesktop", {
  pendingFile: () => ipcRenderer.invoke("vdoo:pending-file"),
  open: () => ipcRenderer.invoke("vdoo:open"),
  save: (request) => ipcRenderer.invoke("vdoo:save", request),
  openLink: (url) => ipcRenderer.invoke("vdoo:open-link", url),
  close: () => ipcRenderer.invoke("vdoo:close"),
  onOpenFile: (callback) => subscribe("vdoo:open-file", callback),
  onCloseRequested: (callback) => subscribe("vdoo:close-requested", callback),
  ai: {
    status: () => ipcRenderer.invoke("vdoo:ai-status"),
    signInChatGPT: () => ipcRenderer.invoke("vdoo:ai-chatgpt-signin"),
    signOutChatGPT: () => ipcRenderer.invoke("vdoo:ai-chatgpt-signout"),
    chatgptWelcomeSeen: () => ipcRenderer.invoke("vdoo:ai-chatgpt-welcome-seen"),
    chatgptModels: () => ipcRenderer.invoke("vdoo:ai-chatgpt-models"),
    recheckClaude: () => ipcRenderer.invoke("vdoo:ai-claude-recheck"),
    customEndpoint: (action, input) => ipcRenderer.invoke("vdoo:ai-custom-endpoint", action, input),
    customModels: () => ipcRenderer.invoke("vdoo:ai-custom-models"),
    ask: (request) => ipcRenderer.invoke("vdoo:ai-ask", request),
    cancel: (id) => ipcRenderer.invoke("vdoo:ai-cancel", id),
    /** Called with { id, type: "delta" | "done" | "error", text?, message?, code?, link? } for every answer. */
    onEvent: (callback) => subscribe("vdoo:ai-event", callback),
  },
});
