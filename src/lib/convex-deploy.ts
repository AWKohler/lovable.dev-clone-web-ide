import { WebContainer } from "@webcontainer/api";
import JSZip from "jszip";

/**
 * Deploy Convex code to fly.io worker
 * This zips ONLY the convex folder and supporting files (package.json, lock files, tsconfig.json)
 * and sends them to the fly.io worker for deployment
 */
export async function deployConvexToFly(
  projectId: string,
  container: WebContainer,
): Promise<{ ok: boolean; output: string; error?: string }> {
  try {

    // Create zip with ONLY convex folder and supporting files
    const zip = new JSZip();

    // Check if convex folder exists
    let hasConvexFolder = false;
    try {
      await container.fs.readdir("/convex");
      hasConvexFolder = true;
    } catch {
      return {
        ok: false,
        output: "",
        error: "No convex folder found in project - nothing to deploy",
      };
    }

    // Add convex folder recursively
    if (hasConvexFolder) {
      await addFolderToZip(container, "/convex", zip, "convex");
    }

    // Add package.json if exists
    try {
      const pkgJson = await container.fs.readFile("/package.json", "utf8");
      zip.file("package.json", pkgJson);
    } catch {
      // Optional
    }

    // Add lock files if they exist
    try {
      const pnpmLock = await container.fs.readFile("/pnpm-lock.yaml", "utf8");
      zip.file("pnpm-lock.yaml", pnpmLock);
    } catch {
      try {
        const npmLock = await container.fs.readFile(
          "/package-lock.json",
          "utf8",
        );
        zip.file("package-lock.json", npmLock);
      } catch {
        // No lock file
      }
    }

    // Add tsconfig.json if exists
    try {
      const tsconfig = await container.fs.readFile("/tsconfig.json", "utf8");
      zip.file("tsconfig.json", tsconfig);
    } catch {
      // Optional
    }

    // Generate zip blob
    const zipBlob = await zip.generateAsync({ type: "blob" });

    // Send to API route which will handle database access and forward to fly.io
    const response = await fetch(`/api/projects/${projectId}/convex/deploy`, {
      method: "POST",
      body: zipBlob,
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        ok: false,
        output: errorData.output || "",
        error: errorData.error || `Deployment failed with status ${response.status}`,
      };
    }

    const result = await response.json();
    return result;
  } catch (error) {
    return {
      ok: false,
      output: "",
      error: `Deployment error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Recursively add a folder to a JSZip instance
 */
async function addFolderToZip(
  container: WebContainer,
  sourcePath: string,
  zip: JSZip,
  zipPath: string,
): Promise<void> {
  const entries = await container.fs.readdir(sourcePath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = `${sourcePath}/${entry.name}`;
    const fullZipPath = `${zipPath}/${entry.name}`;

    if (entry.isDirectory()) {
      // Recursively add subdirectory
      await addFolderToZip(container, fullPath, zip, fullZipPath);
    } else if (entry.isFile()) {
      // Add file
      try {
        const content = await container.fs.readFile(fullPath, "utf8");
        zip.file(fullZipPath, content);
      } catch (error) {
        console.error(`Failed to add file ${fullPath} to zip:`, error);
      }
    }
  }
}
