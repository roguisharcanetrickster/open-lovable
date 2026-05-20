import { SandboxProvider, SandboxInfo, CommandResult } from "../types";

export class CoolifyProvider extends SandboxProvider {
	private existingFiles: Set<string> = new Set();
	private agentUrl: string;
	private viteUrl: string;
	private coolifyApi: string;
	private coolifyAddress: string;

	constructor(config: any) {
		super(config);
		this.coolifyApi = config.coolify?.api || process.env.COOLIFY_API || "";
		this.coolifyAddress =
			config.coolify?.address || process.env.COOLIFY_ADDRESS || "";
		this.agentUrl =
			config.coolify?.agentUrl ||
			process.env.COOLIFY_SANDBOX_AGENT_URL ||
			"http://sandbox:3001";
		this.viteUrl =
			config.coolify?.viteUrl ||
			process.env.COOLIFY_SANDBOX_VITE_URL ||
			"http://localhost:5173";
	}

	async createSandbox(): Promise<SandboxInfo> {
		try {
			console.log("[CoolifyProvider] Initializing sandbox via Coolify...");
			this.existingFiles.clear();

			// Check Coolify API version/connectivity as a validation step
			if (this.coolifyApi && this.coolifyAddress) {
				try {
					const cleanAddress = this.coolifyAddress.replace(/\/+$/, "");
					const versionEndpoints = [
						`${cleanAddress}/api/v1/version`,
						`${cleanAddress}/version`,
					];

					let connected = false;
					let version = "unknown";

					for (const url of versionEndpoints) {
						try {
							const res = await fetch(url, {
								headers: {
									Authorization: `Bearer ${this.coolifyApi}`,
								},
								signal: AbortSignal.timeout(5000),
							});
							if (res.ok) {
								const data = await res.json().catch(() => ({}));
								version = data.version || data.message || "ok";
								connected = true;
								break;
							}
						} catch (e) {
							// Try next URL
						}
					}

					if (connected) {
						console.log(
							`[CoolifyProvider] Successfully validated Coolify connection (Version: ${version})`,
						);
					} else {
						console.warn(
							"[CoolifyProvider] Could not connect to Coolify API version endpoint. Proceeding anyway...",
						);
					}
				} catch (err) {
					console.warn("[CoolifyProvider] Coolify API check error:", err);
				}
			}

			// Check Agent connectivity
			console.log(
				`[CoolifyProvider] Connecting to sandbox agent at: ${this.agentUrl}`,
			);
			let agentReady = false;
			const startTime = Date.now();

			// Wait up to 10 seconds for the Agent container to start
			while (Date.now() - startTime < 10000) {
				try {
					const res = await fetch(`${this.agentUrl}/health`, {
						signal: AbortSignal.timeout(2000),
					});
					if (res.ok) {
						agentReady = true;
						break;
					}
				} catch (e) {
					await new Promise((r) => setTimeout(r, 1000));
				}
			}

			if (!agentReady) {
				throw new Error(
					`Failed to connect to Sandbox Agent at ${this.agentUrl}. Ensure the sandbox container is running and healthy.`,
				);
			}

			const sandboxId = `coolify-${Date.now()}`;
			this.sandbox = { active: true }; // Dummy handle to satisfy SandboxProvider properties
			this.sandboxInfo = {
				sandboxId,
				url: this.viteUrl,
				provider: "coolify",
				createdAt: new Date(),
			};

			console.log(
				`[CoolifyProvider] Sandbox initialized successfully. ID: ${sandboxId}`,
			);
			return this.sandboxInfo;
		} catch (error) {
			console.error("[CoolifyProvider] Error creating sandbox:", error);
			throw error;
		}
	}

	async runCommand(command: string): Promise<CommandResult> {
		try {
			const res = await fetch(`${this.agentUrl}/execute`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ command }),
				signal: AbortSignal.timeout(300000), // 5 minutes timeout
			});

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(
					`Agent execution failed inside container: ${errorText}`,
				);
			}

			const data = (await res.json()) as CommandResult;
			return data;
		} catch (error: any) {
			console.error(
				`[CoolifyProvider] Error running command "${command}":`,
				error,
			);
			return {
				stdout: "",
				stderr: error.message || "Command execution failed",
				exitCode: 1,
				success: false,
			};
		}
	}

	async writeFile(path: string, content: string): Promise<void> {
		try {
			const res = await fetch(`${this.agentUrl}/write-file`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path, content }),
				signal: AbortSignal.timeout(30000),
			});

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(`Agent write failed: ${errorText}`);
			}

			this.existingFiles.add(path);
		} catch (error) {
			console.error(
				`[CoolifyProvider] Error writing file to path "${path}":`,
				error,
			);
			throw error;
		}
	}

	async readFile(path: string): Promise<string> {
		try {
			const res = await fetch(`${this.agentUrl}/read-file`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ path }),
				signal: AbortSignal.timeout(30000),
			});

			if (!res.ok) {
				const errorText = await res.text();
				throw new Error(`Agent read failed: ${errorText}`);
			}

			const data = await res.json();
			return data.content;
		} catch (error) {
			console.error(
				`[CoolifyProvider] Error reading file from path "${path}":`,
				error,
			);
			throw error;
		}
	}

	async listFiles(directory: string = "/vercel/sandbox"): Promise<string[]> {
		try {
			const res = await fetch(`${this.agentUrl}/list-files`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ directory }),
				signal: AbortSignal.timeout(30000),
			});

			if (!res.ok) {
				return [];
			}

			const data = await res.json();
			return data.files || [];
		} catch (error) {
			console.error("[CoolifyProvider] Error listing files:", error);
			return [];
		}
	}

	async installPackages(packages: string[]): Promise<CommandResult> {
		const flags = process.env.NPM_FLAGS || "";
		const args = ["install"];
		if (flags) {
			args.push(...flags.split(" "));
		}
		args.push(...packages);

		const command = `npm ${args.join(" ")}`;
		const result = await this.runCommand(command);

		if (result.success && process.env.AUTO_RESTART_VITE === "true") {
			await this.restartViteServer();
		}

		return result;
	}

	async setupViteApp(): Promise<void> {
		console.log("[CoolifyProvider] Setting up Vite app inside Sandbox...");

		// Create sandbox repository directory structure
		await this.runCommand("mkdir -p /vercel/sandbox/src");

		// Create starting package.json
		const packageJson = {
			name: "sandbox-app",
			version: "1.0.0",
			type: "module",
			scripts: {
				dev: "vite --host 0.0.0.0",
				build: "vite build",
				preview: "vite preview",
			},
			dependencies: {
				react: "^18.2.0",
				"react-dom": "^18.2.0",
			},
			devDependencies: {
				"@vitejs/plugin-react": "^4.0.0",
				vite: "^4.3.9",
				tailwindcss: "^3.3.0",
				postcss: "^8.4.31",
				autoprefixer: "^10.4.16",
			},
		};

		await this.writeFile("package.json", JSON.stringify(packageJson, null, 2));

		// Create starting vite.config.js
		const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true, // Allow direct proxying/tunneling/hostnames
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  }
})`;

		await this.writeFile("vite.config.js", viteConfig);

		// Create tailwind.config.js
		const tailwindConfig = `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}`;

		await this.writeFile("tailwind.config.js", tailwindConfig);

		// Create postcss.config.js
		const postcssConfig = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`;

		await this.writeFile("postcss.config.js", postcssConfig);

		// Create index.html
		const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sandbox App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;

		await this.writeFile("index.html", indexHtml);

		// Create src/main.jsx
		const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

		await this.writeFile("src/main.jsx", mainJsx);

		// Create src/App.jsx
		const appJsx = `function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="text-center max-w-2xl">
        <p className="text-lg text-gray-400">
          Sandbox Ready (Coolify Provider)<br/>
          Start building your React app with Vite and Tailwind CSS!
        </p>
      </div>
    </div>
  )
}

export default App`;

		await this.writeFile("src/App.jsx", appJsx);

		// Create src/index.css
		const indexCss = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  background-color: rgb(17 24 39);
}`;

		await this.writeFile("src/index.css", indexCss);

		// Complete setup, run npm install
		console.log(
			"[CoolifyProvider] Running npm install in sandbox container...",
		);
		const installResult = await this.runCommand("npm install");
		if (!installResult.success) {
			console.warn(
				"[CoolifyProvider] npm install finished with warnings/errors:",
				installResult.stderr,
			);
		}

		// Start Vite dev server inside sandbox container
		console.log("[CoolifyProvider] Starting Vite development server...");
		await this.runCommand("pkill -f vite || true");

		// Start Vite in background inside the sandbox container
		await this.runCommand("nohup npm run dev > /tmp/vite.log 2>&1 &");

		// Wait a brief period for Vite server to boot up
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Cache initial tracks
		this.existingFiles.add("src/App.jsx");
		this.existingFiles.add("src/main.jsx");
		this.existingFiles.add("src/index.css");
		this.existingFiles.add("index.html");
		this.existingFiles.add("package.json");
		this.existingFiles.add("vite.config.js");
		this.existingFiles.add("tailwind.config.js");
		this.existingFiles.add("postcss.config.js");
	}

	async restartViteServer(): Promise<void> {
		console.log("[CoolifyProvider] Restarting Vite development server...");
		await this.runCommand("pkill -f vite || true");
		await new Promise((resolve) => setTimeout(resolve, 2000));
		await this.runCommand("nohup npm run dev > /tmp/vite.log 2>&1 &");
		await new Promise((resolve) => setTimeout(resolve, 5000));
	}

	getSandboxUrl(): string | null {
		return this.sandboxInfo?.url || null;
	}

	getSandboxInfo(): SandboxInfo | null {
		return this.sandboxInfo;
	}

	async terminate(): Promise<void> {
		console.log("[CoolifyProvider] Terminating Coolify sandbox app...");
		try {
			await this.runCommand("pkill -f vite || true");
		} catch {
			// Ignore
		}
		this.sandbox = null;
		this.sandboxInfo = null;
	}

	isAlive(): boolean {
		return !!this.sandbox;
	}
}
