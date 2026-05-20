import http from "http";
import fs from "fs";
import path from "path";
import { exec } from "child_process";

const PORT = process.env.PORT || 3001;
const WORKSPACE_DIR = "/vercel/sandbox";

// Ensure workspace directory exists
if (!fs.existsSync(WORKSPACE_DIR)) {
	fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

function parseJsonBody(req) {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk.toString();
		});
		req.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch (err) {
				reject(err);
			}
		});
	});
}

function respondJson(res, statusCode, data) {
	res.writeHead(statusCode, { "Content-Type": "application/json" });
	res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
	// CORS Headers
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://${req.headers.host}`);

	if (url.pathname === "/health" && req.method === "GET") {
		respondJson(res, 200, { status: "ok", workspace: WORKSPACE_DIR });
		return;
	}

	if (url.pathname === "/execute" && req.method === "POST") {
		try {
			const { command, cwd = WORKSPACE_DIR } = await parseJsonBody(req);
			if (!command) {
				respondJson(res, 400, { error: "command is required" });
				return;
			}

			console.log(`[Agent] Executing command: "${command}" in cwd: "${cwd}"`);

			exec(
				command,
				{ cwd, maxBuffer: 1024 * 1024 * 10 },
				(error, stdout, stderr) => {
					const exitCode = error ? error.code || 1 : 0;
					respondJson(res, 200, {
						stdout,
						stderr,
						exitCode,
						success: exitCode === 0,
					});
				},
			);
		} catch (err) {
			respondJson(res, 500, { error: err.message });
		}
		return;
	}

	if (url.pathname === "/write-file" && req.method === "POST") {
		try {
			const { path: relativePath, content } = await parseJsonBody(req);
			if (relativePath === undefined || content === undefined) {
				respondJson(res, 400, { error: "path and content are required" });
				return;
			}

			const fullPath = relativePath.startsWith("/")
				? relativePath
				: path.join(WORKSPACE_DIR, relativePath);
			const dir = path.dirname(fullPath);

			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			fs.writeFileSync(fullPath, content, "utf-8");
			console.log(`[Agent] File written successfully: ${fullPath}`);
			respondJson(res, 200, { success: true });
		} catch (err) {
			respondJson(res, 500, { error: err.message });
		}
		return;
	}

	if (url.pathname === "/read-file" && req.method === "POST") {
		try {
			const { path: relativePath } = await parseJsonBody(req);
			if (!relativePath) {
				respondJson(res, 400, { error: "path is required" });
				return;
			}

			const fullPath = relativePath.startsWith("/")
				? relativePath
				: path.join(WORKSPACE_DIR, relativePath);
			if (!fs.existsSync(fullPath)) {
				respondJson(res, 404, { error: `File not found: ${relativePath}` });
				return;
			}

			const content = fs.readFileSync(fullPath, "utf-8");
			respondJson(res, 200, { content });
		} catch (err) {
			respondJson(res, 500, { error: err.message });
		}
		return;
	}

	if (url.pathname === "/list-files" && req.method === "POST") {
		try {
			const { directory = WORKSPACE_DIR } = await parseJsonBody(req);
			const targetDir = directory.startsWith("/")
				? directory
				: path.join(WORKSPACE_DIR, directory);

			if (!fs.existsSync(targetDir)) {
				respondJson(res, 404, { error: `Directory not found: ${directory}` });
				return;
			}

			const getFilesRecursively = (dir) => {
				let results = [];
				const list = fs.readdirSync(dir);
				list.forEach((file) => {
					const filePath = path.join(dir, file);
					const stat = fs.statSync(filePath);
					if (stat && stat.isDirectory()) {
						if (
							file !== "node_modules" &&
							file !== ".git" &&
							file !== ".next" &&
							file !== "dist"
						) {
							results = results.concat(getFilesRecursively(filePath));
						}
					} else {
						results.push(path.relative(WORKSPACE_DIR, filePath));
					}
				});
				return results;
			};

			const files = getFilesRecursively(targetDir);
			respondJson(res, 200, { files });
		} catch (err) {
			respondJson(res, 500, { error: err.message });
		}
		return;
	}

	respondJson(res, 404, { error: "Endpoint not found" });
});

server.listen(PORT, () => {
	console.log(`[Agent] Sandbox Agent Server running on port ${PORT}`);
	console.log(`[Agent] Workspace set to: ${WORKSPACE_DIR}`);
});
