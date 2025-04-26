interface Window {
  hostsAPI: {
    loadHosts: () => Promise<{ success: boolean; content?: string; error?: string }>;
    saveHosts: (content: string) => Promise<{ success: boolean; error?: string }>;
  };
}
