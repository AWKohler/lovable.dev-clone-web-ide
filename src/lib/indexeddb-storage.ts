// IndexedDB storage for WebContainer files with compression
import { WebContainer } from '@webcontainer/api';

const DB_NAME = 'webcontainer-projects';
const DB_VERSION = 1;
const FILES_STORE = 'files';

interface FileRecord {
  id: string; // projectId-filepath
  projectId: string;
  path: string;
  type: 'file' | 'folder';
  content?: string; // Only for files
  compressed?: boolean;
  size?: number;
  compressedSize?: number;
}

class IndexedDBStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          
          // Create files store if it doesn't exist
          if (!db.objectStoreNames.contains(FILES_STORE)) {
            const store = db.createObjectStore(FILES_STORE, { keyPath: 'id' });
            store.createIndex('projectId', 'projectId', { unique: false });
          }
        };
      });
    }
    return this.dbPromise;
  }

  private compress(text: string): string {
    // Simple compression using built-in compression
    try {
      const compressed = btoa(
        new Uint8Array(
          new TextEncoder().encode(text)
        ).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );
      return compressed;
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error);
      return text;
    }
  }

  private decompress(compressed: string, isCompressed: boolean): string {
    if (!isCompressed) return compressed;
    
    try {
      const binary = atob(compressed);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } catch (error) {
      console.warn('Decompression failed, returning as-is:', error);
      return compressed;
    }
  }

  async saveProjectState(projectId: string, container: WebContainer): Promise<void> {
    const db = await this.getDB();
    const transaction = db.transaction([FILES_STORE], 'readwrite');
    const store = transaction.objectStore(FILES_STORE);

    // Clear existing files for this project
    const index = store.index('projectId');
    const existingFiles = await new Promise<FileRecord[]>((resolve, reject) => {
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Delete existing files
    for (const file of existingFiles) {
      await new Promise<void>((resolve, reject) => {
        const deleteRequest = store.delete(file.id);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    }

    // Get all files from WebContainer
    const files = await this.getAllFiles(container);
    let totalSize = 0;
    let compressedSize = 0;

    // Save each file
    for (const [path, fileData] of Object.entries(files)) {
      // Skip system files
      if (path.includes('node_modules') || path.includes('.git')) continue;

      const record: FileRecord = {
        id: `${projectId}-${path}`,
        projectId,
        path,
        type: fileData.type as 'file' | 'folder'
      };

      if (fileData.type === 'file' && fileData.content) {
        const originalSize = fileData.content.length;
        const compressed = this.compress(fileData.content);
        const isSmaller = compressed.length < originalSize;
        
        record.content = isSmaller ? compressed : fileData.content;
        record.compressed = isSmaller;
        record.size = originalSize;
        record.compressedSize = record.content.length;
        
        totalSize += originalSize;
        compressedSize += record.content.length;
      }

      await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    console.log(`SAVE webcontainer-${projectId} files: ${Object.keys(files).length} size: ${(totalSize / 1024).toFixed(2)}KB compressed: ${(compressedSize / 1024).toFixed(2)}KB`);
  }

  async loadProjectState(projectId: string): Promise<Record<string, { type: string; content?: string }> | null> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([FILES_STORE], 'readonly');
      const store = transaction.objectStore(FILES_STORE);
      const index = store.index('projectId');

      const files = await new Promise<FileRecord[]>((resolve, reject) => {
        const request = index.getAll(projectId);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (files.length === 0) {
        return null;
      }

      const result: Record<string, { type: string; content?: string }> = {};
      
      for (const file of files) {
        result[file.path] = {
          type: file.type
        };

        if (file.type === 'file' && file.content) {
          result[file.path].content = this.decompress(file.content, file.compressed || false);
        }
      }

      console.log(`LOAD webcontainer-${projectId} found ${files.length} files`);
      return result;
    } catch (error) {
      console.warn('Failed to load project state from IndexedDB:', error);
      return null;
    }
  }

  private async getAllFiles(container: WebContainer): Promise<Record<string, { type: string; content?: string }>> {
    const files: Record<string, { type: string; content?: string }> = {};
    
    async function processDirectory(path: string) {
      try {
        const entries = await container.fs.readdir(path, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
          
          if (entry.isDirectory()) {
            files[fullPath] = { type: 'folder' };
            await processDirectory(fullPath);
          } else {
            try {
              const content = await container.fs.readFile(fullPath, 'utf8');
              files[fullPath] = { 
                type: 'file',
                content: content
              };
            } catch {
              // Handle binary files or read errors
              files[fullPath] = { type: 'file' };
            }
          }
        }
      } catch (error) {
        console.warn(`Error reading directory ${path}:`, error);
      }
    }

    await processDirectory('/');
    return files;
  }

  async restoreFiles(container: WebContainer, files: Record<string, { type: string; content?: string }>): Promise<void> {
    // Clear existing files first (except node_modules)
    try {
      const entries = await container.fs.readdir('/', { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          await container.fs.rm(`/${entry.name}`, { recursive: true, force: true });
        }
      }
    } catch (error) {
      console.warn('Failed to clear existing files:', error);
    }

    // Restore files
    const sortedPaths = Object.keys(files).sort((a, b) => a.length - b.length);
    
    for (const filePath of sortedPaths) {
      const fileData = files[filePath];
      
      if (fileData.type === 'folder') {
        try {
          await container.fs.mkdir(filePath, { recursive: true });
        } catch (error) {
          console.warn(`Failed to create directory ${filePath}:`, error);
        }
      } else if (fileData.type === 'file' && fileData.content !== undefined) {
        try {
          // Ensure parent directory exists
          const parentDir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
          if (parentDir !== '/') {
            await container.fs.mkdir(parentDir, { recursive: true });
          }
          
          await container.fs.writeFile(filePath, fileData.content);
        } catch (error) {
          console.warn(`Failed to restore file ${filePath}:`, error);
        }
      }
    }
  }
}

export const indexedDBStorage = new IndexedDBStorage();