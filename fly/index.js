// import http from "http";

// const port = process.env.PORT || 8080;

// // Minimal placeholder worker that accepts POST requests.
// const server = http.createServer(async (req, res) => {
//   if (req.method !== "POST") {
//     res.writeHead(405);
//     return res.end();
//   }

//   res.writeHead(200);
//   res.end("ok");
// });

// server.listen(port, () => {
//   console.log(`Worker listening on ${port}`);
// });
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import unzipper from "unzipper";
import { spawn } from "child_process";

const port = process.env.PORT || 8080;

const AUTH_HEADER = "authorization";
const EXPECTED_TOKEN = process.env.WORKER_AUTH_TOKEN;

if (!EXPECTED_TOKEN) {
  throw new Error("WORKER_AUTH_TOKEN is not set");
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, options);

    child.stdout.on("data", (d) => options.onStdout?.(d));
    child.stderr.on("data", (d) => options.onStderr?.(d));

    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end();
  }

  const auth = req.headers[AUTH_HEADER];
  if (auth !== `Bearer ${EXPECTED_TOKEN}`) {
    res.writeHead(401);
    return res.end("unauthorized");
  }

  // Create temp directory
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "convex-job-"));

  try {
    // Save ZIP to disk
    const zipPath = path.join(jobDir, "snapshot.zip");
    const writeStream = fs.createWriteStream(zipPath);
    req.pipe(writeStream);

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Extract ZIP
    await fs
      .createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: jobDir }))
      .promise();

    res.write("Installing dependencies...\n");

    await run("npm", ["install", "--omit=dev"], {
      cwd: jobDir,
      onStdout: (d) => res.write(d),
      onStderr: (d) => res.write(d),
    });

    res.write("\nRunning convex deploy...\n");

    await run("convex", ["deploy"], {
      cwd: jobDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
      },
      onStdout: (d) => res.write(d),
      onStderr: (d) => res.write(d),
    });

    res.writeHead(200, { "Content-Type": "text/plain" });

    child.stdout.on("data", (chunk) => {
      res.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      res.write(chunk);
    });

    child.on("close", (code) => {
      res.end(`\nconvex deploy exited with code ${code}\n`);
    });
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("error");
  }
});

server.listen(port, () => {
  console.log(`Worker listening on ${port}`);
});
