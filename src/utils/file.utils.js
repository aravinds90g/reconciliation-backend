const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

exports.generateUniqueFileName = (originalName) => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const timestamp = Date.now();
  const uniqueId = uuidv4().slice(0, 8);
  
  return `${baseName}-${timestamp}-${uniqueId}${ext}`;
};

exports.ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
};

exports.deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error(`Failed to delete file ${filePath}:`, error);
    return false;
  }
};

exports.getFileStats = async (filePath) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime
    };
  } catch (error) {
    throw new Error(`Failed to get file stats: ${error.message}`);
  }
};

exports.readFileChunk = async (filePath, startLine = 0, chunkSize = 100) => {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const headers = lines[0].split(',');
    
    const chunk = lines
      .slice(startLine + 1, startLine + 1 + chunkSize)
      .map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((header, index) => {
          row[header.trim()] = values[index] ? values[index].trim() : '';
        });
        return row;
      });
    
    return {
      headers,
      rows: chunk,
      totalRows: lines.length - 1,
      hasMore: startLine + chunkSize < lines.length - 1
    };
  } catch (error) {
    throw new Error(`Failed to read file chunk: ${error.message}`);
  }
};
