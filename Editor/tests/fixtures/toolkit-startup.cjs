const originalFetch = globalThis.fetch;
globalThis.toolkitStartupQA = { attempts: [], online: false, connected: false, otherRequests: 0 };
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('http://127.0.0.1:34871/')) return originalFetch(url, options);
  const state = globalThis.toolkitStartupQA;
  if (!String(url).endsWith('/discover')) { state.otherRequests++; throw new Error('Startup must only discover'); }
  state.attempts.push(Date.now());
  if (!state.online) throw new Error('Toolkit not started yet');
  state.connected = true;
  return Response.json({ uiEditorImport: 1, uiEditorImageUpload: 1,
    projects: [{ id: 'game', name: 'Game', placeId: '123', token: 'test-private-token' }] });
};
