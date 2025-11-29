import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import chokidar from 'chokidar';

const { FILE_PATH, LOG_ENDPOINT } = process.env;
const logger = console;

export class LogUpload {
  constructor({ logPath }) {
    this.logPath = logPath;
    this.lastReadPosition = 0;
    this.currentInode = this.getInode(this.logPath);
  }

  getInode(filePath) {
    try {
      return fs.statSync(filePath).ino;
    } catch (e) {
      logger.error(`Error getting inode for ${filePath}:`, e.message);
      return null;
    }
  }

  async uploadLogLines(lines, opts = { attempt: 2 }) {
    const dir = this.logPath.split('/');
    const fname = dir[dir.length - 1];
    const res = await fetch(`${LOG_ENDPOINT}/${fname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: lines.map(line => JSON.stringify({ log: line })).join('\n'),
    });
    if (res.ok) {
      logger.debug({ 'Uploaded log lines': lines.length });
      return;
    }
    if (--opts.attempt <= 0) {
      throw new Error(`Failed to upload: ${res.statusText}`);
    }
    await new Promise(resolve => { setTimeout(resolve, 200); });
    await this.uploadLogLines(lines, opts);
  }

  async processLogFile() {
    const input = fs.createReadStream(this.logPath, { start: this.lastReadPosition });
    const readable = readline.createInterface({ input, crlfDelay: Infinity });
    const lines = [];
    for await (const line of readable) lines.push(line);
    if (lines.length > 0) {
      await this.uploadLogLines(lines).catch(e => logger.error(e.message));
      this.lastReadPosition += lines.reduce((acc, line) => acc + Buffer.byteLength(`${line}\n`), 0);
    }
  }

  async start() {
    await this.processLogFile();
    const watcher = chokidar.watch(path.dirname(this.logPath), { persistent: true });
    watcher.on('all', async (event, filePath) => {
      if (filePath === this.logPath) {
        const newInode = this.getInode(this.logPath);
        if (newInode && newInode !== this.currentInode) {
          this.lastReadPosition = 0;
          this.currentInode = newInode;
        }
        await this.processLogFile();
      }
    });
    watcher.on('error', e => logger.error({ Watcher: e.toString() }));
  }
}

const main = () => {
  FILE_PATH.split(',').forEach(logPath => {
    new LogUpload({ logPath }).start();
  });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
