const fs = require('fs-extra');
const readline = require('readline');
const chokidar = require('chokidar');
const path = require('path');
const { statSync } = require('fs');

const { FILE_PATH, LOG_ENDPOINT } = process.env;
const logger = console;
const wait = ms => new Promise(resolve => { setTimeout(resolve, ms); });

class LogUpload {
  constructor({ logPath }) {
    this.logPath = logPath;
    this.lastReadPosition = 0;
    this.currentInode = this.getInode(this.logPath);
  }

  getInode(filePath) {
    try {
      return statSync(filePath).ino;
    } catch (error) {
      logger.error(`Error getting inode for ${filePath}:`, error);
      return null;
    }
  }

  async uploadLogLines(lines) {
    const dir = this.logPath.split('/');
    const fname = dir[dir.length - 1];
    const response = await fetch(`${LOG_ENDPOINT}/${fname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: lines.map(line => JSON.stringify({ log: line })).join('\n'),
    });
    if (!response.ok) {
      throw new Error(`Failed to upload: ${response.statusText}`);
    }
    logger.debug({ 'Uploaded log lines': lines.length });
  }

  async processLogFile() {
    const input = fs.createReadStream(this.logPath, { start: this.lastReadPosition });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    const lines = [];
    for await (const line of rl) lines.push(line);
    if (lines.length > 0) {
      await this.uploadLogLines(lines)
      .catch(e => {
        logger.warn('Retry', e);
        // 最初のエラーは警告とし、１度だけリトライ
        return wait(200).then(() => this.uploadLogLines(lines));
      })
      .catch(e => {
        logger.error(e);
      });
      this.lastReadPosition += lines.reduce((acc, line) => acc + Buffer.byteLength(`${line}\n`), 0);
    }
  }

  async main() {
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
    watcher.on('error', e => logger.error('Watcher error:', e));
  }
}

const main = () => {
  FILE_PATH.split(',').forEach(logPath => {
    new LogUpload({ logPath }).main();
  });
};

main();
