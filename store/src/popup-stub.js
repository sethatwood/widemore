// Stands in for the chrome.* API so the real popup renders outside the
// extension for the store screenshot. Loaded before defaults.js by the
// asset build script; never shipped in the extension ZIP.
window.chrome = {
  storage: {
    sync: { get: () => Promise.resolve({ settings: null }), set: () => {} },
    onChanged: { addListener: () => {} }
  },
  tabs: {
    query: () => Promise.resolve([{ url: 'https://en.wikipedia.org/wiki/Ultrawide_monitor' }]),
    create: () => {}
  },
  commands: {
    getAll: (cb) => cb([
      { name: 'toggle-rails', shortcut: '⌥⇧W' },
      { name: 'zoom-fit', shortcut: '⌥⇧F' }
    ])
  }
}
