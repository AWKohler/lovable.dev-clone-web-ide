// Debug utilities for inspecting WebContainer IndexedDB storage
// Use these functions in Chrome DevTools Console

interface FileRecord {
  id: string;
  projectId: string;
  path: string;
  type: 'file' | 'folder';
  content?: string;
  compressed?: boolean;
  size?: number;
  compressedSize?: number;
}

export const debugStorage = {
  // List all databases
  async listDatabases() {
    const databases = await indexedDB.databases();
    console.log('Available databases:', databases);
    return databases;
  },

  // View all files for a project
  async viewProjectFiles(projectId: string) {
    const dbReq = indexedDB.open('webcontainer-projects');
    return new Promise((resolve, reject) => {
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const tx = db.transaction(['files'], 'readonly');
        const store = tx.objectStore('files');
        const index = store.index('projectId');
        const req = index.getAll(projectId);
        
        req.onsuccess = () => {
          console.log(`Files for project ${projectId}:`, req.result);
          console.table(req.result.map(f => ({
            path: f.path,
            type: f.type,
            size: f.size ? `${(f.size / 1024).toFixed(2)}KB` : 'N/A',
            compressed: f.compressed ? `${(f.compressedSize! / 1024).toFixed(2)}KB` : 'No',
            ratio: f.size && f.compressedSize ? `${((1 - f.compressedSize / f.size) * 100).toFixed(1)}%` : 'N/A'
          })));
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      };
      dbReq.onerror = () => reject(dbReq.error);
    });
  },

  // View all files across all projects
  async viewAllFiles() {
    const dbReq = indexedDB.open('webcontainer-projects');
    return new Promise((resolve, reject) => {
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const tx = db.transaction(['files'], 'readonly');
        const store = tx.objectStore('files');
        const req = store.getAll();
        
        req.onsuccess = () => {
          console.log('All files:', req.result);
          const grouped = req.result.reduce((acc, file) => {
            if (!acc[file.projectId]) acc[file.projectId] = [];
            acc[file.projectId].push(file);
            return acc;
          }, {} as Record<string, FileRecord[]>);
          console.log('Grouped by project:', grouped);
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      };
      dbReq.onerror = () => reject(dbReq.error);
    });
  },

  // Get storage usage stats
  async getStorageStats() {
    const dbReq = indexedDB.open('webcontainer-projects');
    return new Promise((resolve, reject) => {
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const tx = db.transaction(['files'], 'readonly');
        const store = tx.objectStore('files');
        const req = store.getAll();
        
        req.onsuccess = () => {
          const files = req.result;
          const stats = files.reduce((acc, file) => {
            acc.totalFiles++;
            if (file.type === 'file') {
              acc.fileCount++;
              if (file.size) {
                acc.totalSize += file.size;
                acc.totalCompressed += file.compressedSize || file.size;
              }
              if (file.compressed) acc.compressedFiles++;
            } else {
              acc.folderCount++;
            }
            return acc;
          }, {
            totalFiles: 0,
            fileCount: 0,
            folderCount: 0,
            compressedFiles: 0,
            totalSize: 0,
            totalCompressed: 0
          });

          const compressionRatio = stats.totalSize > 0 ? 
            ((1 - stats.totalCompressed / stats.totalSize) * 100).toFixed(1) : '0';

          console.log('Storage Stats:', {
            ...stats,
            totalSizeKB: `${(stats.totalSize / 1024).toFixed(2)}KB`,
            totalCompressedKB: `${(stats.totalCompressed / 1024).toFixed(2)}KB`,
            compressionRatio: `${compressionRatio}%`,
            avgCompressionRatio: stats.compressedFiles > 0 ? compressionRatio : 'N/A'
          });

          resolve(stats);
        };
        req.onerror = () => reject(req.error);
      };
      dbReq.onerror = () => reject(dbReq.error);
    });
  },

  // Clear all data for a project
  async clearProject(projectId: string) {
    const dbReq = indexedDB.open('webcontainer-projects');
    return new Promise((resolve, reject) => {
      dbReq.onsuccess = () => {
        const db = dbReq.result;
        const tx = db.transaction(['files'], 'readwrite');
        const store = tx.objectStore('files');
        const index = store.index('projectId');
        const req = index.getAllKeys(projectId);
        
        req.onsuccess = () => {
          const deletePromises = req.result.map(key => 
            new Promise<void>((res, rej) => {
              const delReq = store.delete(key);
              delReq.onsuccess = () => res();
              delReq.onerror = () => rej(delReq.error);
            })
          );
          
          Promise.all(deletePromises)
            .then(() => {
              console.log(`Cleared ${req.result.length} files for project ${projectId}`);
              resolve(req.result.length);
            })
            .catch(reject);
        };
        req.onerror = () => reject(req.error);
      };
      dbReq.onerror = () => reject(dbReq.error);
    });
  }
};

// Make it available globally for console debugging
if (typeof window !== 'undefined') {
  (window as unknown as { debugStorage: typeof debugStorage }).debugStorage = debugStorage;
}