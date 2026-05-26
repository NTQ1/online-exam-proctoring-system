const LOG_LEVEL = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel = LOG_LEVEL.info;

function format(level, message, data) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
}

function log(level, message, data) {
  if (LOG_LEVEL[level] < currentLevel) return;
  const output = format(level, message, data);
  console.log(output);
}

export const logger = {
  debug: (msg, data) => log('debug', msg, data),
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data),
  setLevel: (level) => { currentLevel = LOG_LEVEL[level] || LOG_LEVEL.info; },
};