import { WebContainer } from "@webcontainer/api";
import JSZip from "jszip";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

// FLY_WORKER_URL=https://fly-shy-feather-7138.fly.dev
//

const FLY_WORKER_URL = "https://fly-shy-feather-7138.fly.dev";

const WORKER_AUTH_TOKEN = "dev-secret";

// const FLY_WORKER_URL = process.env.FLY_WORKER_URL;
// const WORKER_AUTH_TOKEN = process.env.WORKER_AUTH_TOKEN;
//
//

if (!FLY_WORKER_URL) {
  console.warn("FLY_WORKER_URL is not set - convex deployments will fail");
}

if (!WORKER_AUTH_TOKEN) {
  console.warn("WORKER_AUTH_TOKEN is not set - convex deployments will fail");
}

/**
 * Deploy Convex code to fly.io worker
 * This zips ONLY the convex folder and supporting files (package.json, lock files, tsconfig.json)
 * and sends them to the fly.io worker for deployment
 */
export async function deployConvexToFly(
  projectId: string,
  container: WebContainer,
): Promise<{ ok: boolean; output: string; error?: string }> {
  if (!FLY_WORKER_URL) {
    return {
      ok: false,
      output: "",
      error: "FLY_WORKER_URL is not configured - cannot deploy Convex",
    };
  }

  if (!WORKER_AUTH_TOKEN) {
    return {
      ok: false,
      output: "",
      error: "WORKER_AUTH_TOKEN is not configured - cannot deploy Convex",
    };
  }

  try {
    // Fetch project to get deploy key
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (!project) {
      return {
        ok: false,
        output: "",
        error: "Project not found",
      };
    }

    if (!project.convexDeployKey) {
      return {
        ok: false,
        output: "",
        error:
          "Project does not have a Convex deploy key - ensure Convex backend was provisioned",
      };
    }

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

    // Send to fly.io worker
    const response = await fetch(FLY_WORKER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WORKER_AUTH_TOKEN}`,
        "X-Convex-Deploy-Key": project.convexDeployKey,
      },
      body: zipBlob,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        output: errorText,
        error: `Deployment failed with status ${response.status}: ${errorText}`,
      };
    }

    // Stream the output
    const output = await response.text();

    // Check if deployment was successful
    const success = output.includes("✅ Convex deploy completed successfully");

    return {
      ok: success,
      output,
      error: success
        ? undefined
        : "Deployment completed but did not report success",
    };
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
