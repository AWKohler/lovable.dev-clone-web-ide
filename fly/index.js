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

function run(cmd, args, { cwd, env, res }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env });

    child.stdout.on("data", (d) => res.write(d));
    child.stderr.on("data", (d) => res.write(d));

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

  const deployKey = req.headers["x-convex-deploy-key"];
  if (!deployKey) {
    res.writeHead(400);
    return res.end("Missing X-Convex-Deploy-Key");
  }

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });

  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "convex-job-"));

  try {
    // Save ZIP
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
      env: process.env,
      res,
    });

    res.write("\nRunning convex deploy...\n");

    await run("convex", ["deploy"], {
      cwd: jobDir,
      env: {
        ...process.env,
        CONVEX_DEPLOY_KEY: deployKey,
      },
      res,
    });

    res.end("\n✅ Convex deploy completed successfully\n");
  } catch (err) {
    console.error(err);
    res.write(`\n❌ Error: ${err.message}\n`);
    res.end();
  }
});

server.listen(port, () => {
  console.log(`Worker listening on ${port}`);
});
