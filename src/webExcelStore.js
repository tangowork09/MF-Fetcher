/**
 * Simple pub/sub store for Web Excel worksheets.
 * Any panel can push data here; WebExcelPanel subscribes.
 */
let sheets = []
let listeners = []
let idCounter = 0

export const webExcelStore = {
  getSheets: () => sheets,

  addSheet: (name, data, columns) => {
    idCounter++
    sheets = [...sheets, { id: idCounter, name, data, columns }]
    listeners.forEach(fn => fn(sheets))
    return idCounter
  },

  removeSheet: (id) => {
    sheets = sheets.filter(s => s.id !== id)
    listeners.forEach(fn => fn(sheets))
  },

  updateSheet: (id, data) => {
    sheets = sheets.map(s => s.id === id ? { ...s, data } : s)
    listeners.forEach(fn => fn(sheets))
  },

  clearAll: () => {
    sheets = []
    listeners.forEach(fn => fn(sheets))
  },

  subscribe: (fn) => {
    listeners.push(fn)
    return () => { listeners = listeners.filter(l => l !== fn) }
  },
}
