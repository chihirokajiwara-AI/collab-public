const MAX_UNDO = 50;
const undoStack = [];
const redoStack = [];

export function pushCommand(command) {
  undoStack.push(command);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function undo() {
  const cmd = undoStack.pop();
  if (!cmd) return null;
  redoStack.push(cmd);
  return cmd;
}

export function redo() {
  const cmd = redoStack.pop();
  if (!cmd) return null;
  undoStack.push(cmd);
  return cmd;
}

export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
}
