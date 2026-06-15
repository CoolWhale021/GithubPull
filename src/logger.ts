import { App, DataAdapter } from "obsidian";

interface ErrorData {
	message: string;
	stack?: string;
	name: string;
}

export class Logger {
	private app: App;
	private pluginId: string;
	private logFile = "debug.log";
	private logs: string[] = [];
	private maxLogs = 1000;

	// Serialize file writes through a promise chain. The previous
	// read-modify-write-per-call pattern raced under concurrent log
	// calls (which happen all over a sync) and was O(N²) in I/O.
	private writeQueue: Promise<void> = Promise.resolve();
	private writesSinceTrim = 0;
	private readonly trimEveryN = 200;
	private readonly maxFileLines = 5000;
	private pluginDirEnsured = false;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
	}

	private get logPath(): string {
		return `.obsidian/plugins/${this.pluginId}/${this.logFile}`;
	}

	private formatMessage(level: string, message: string, data?: unknown): string {
		const timestamp = new Date().toISOString();
		let logLine = `[${timestamp}] [${level}] ${message}`;

		if (data !== undefined) {
			try {
				logLine += ` | Data: ${JSON.stringify(data, null, 2)}`;
			} catch (error) {
				logLine += ` | Data: [Could not stringify: ${error.message}]`;
			}
		}

		return logLine;
	}

	private enqueueWrite(message: string): void {
		this.writeQueue = this.writeQueue
			.then(() => this.appendLine(message))
			.catch(err => {
				// Never let one failed write break the queue for subsequent ones.
				console.error("Logger write failed:", err);
			});
	}

	private async ensurePluginDir(): Promise<void> {
		if (this.pluginDirEnsured) return;
		try {
			await this.app.vault.adapter.mkdir(`.obsidian/plugins/${this.pluginId}`);
		} catch {
			// Directory may already exist; that's fine.
		}
		this.pluginDirEnsured = true;
	}

	private async appendLine(message: string): Promise<void> {
		await this.ensurePluginDir();
		const adapter = this.app.vault.adapter;
		const data = message + "\n";

		// Prefer native append (Obsidian >= 1.7.2). Falls back to RMW for older
		// Obsidian versions still permitted by manifest.json minAppVersion.
		const hasAppend = typeof (adapter as Partial<DataAdapter>).append === "function";
		if (hasAppend) {
			try {
				await adapter.append(this.logPath, data);
			} catch {
				// File doesn't exist yet — create it.
				await adapter.write(this.logPath, data);
			}
		} else {
			let existing = "";
			try {
				existing = await adapter.read(this.logPath);
			} catch {
				// File didn't exist.
			}
			await adapter.write(this.logPath, existing + data);
		}

		this.writesSinceTrim++;
		if (this.writesSinceTrim >= this.trimEveryN) {
			this.writesSinceTrim = 0;
			await this.trimFile();
		}
	}

	private async trimFile(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const contents = await adapter.read(this.logPath);

			// Cheap line count without splitting the full string first.
			let newlines = 0;
			for (let i = 0; i < contents.length; i++) {
				if (contents.charCodeAt(i) === 10) newlines++;
			}
			if (newlines <= this.maxFileLines) return;

			const lines = contents.split("\n");
			const trimmed = lines.slice(-this.maxFileLines).join("\n");
			await adapter.write(this.logPath, trimmed);
		} catch {
			// Best-effort trim — ignore failures.
		}
	}

	private record(message: string): void {
		this.logs.push(message);
		if (this.logs.length > this.maxLogs) {
			this.logs.shift();
		}
		console.debug(message);
		this.enqueueWrite(message);
	}

	info(message: string, data?: unknown): void {
		this.record(this.formatMessage("INFO", message, data));
	}

	warn(message: string, data?: unknown): void {
		const formatted = this.formatMessage("WARN", message, data);
		this.record(formatted);
		console.warn(formatted);
	}

	error(message: string, errorArg?: unknown): void {
		let errorData: unknown = errorArg;

		if (errorArg instanceof Error) {
			errorData = {
				message: errorArg.message,
				stack: errorArg.stack,
				name: errorArg.name
			} as ErrorData;
		}

		const formatted = this.formatMessage("ERROR", message, errorData);
		this.record(formatted);
		console.error(formatted);
	}

	debug(message: string, data?: unknown): void {
		this.record(this.formatMessage("DEBUG", message, data));
	}

	getLogs(): string {
		return this.logs.join("\n");
	}

	async getLogFile(): Promise<string> {
		// Drain pending writes so the file reflects everything logged so far.
		await this.writeQueue;
		try {
			return await this.app.vault.adapter.read(this.logPath);
		} catch {
			return "No log file found";
		}
	}

	async clearLogs(): Promise<void> {
		this.logs = [];
		// Wait for any in-flight writes before nuking the file.
		await this.writeQueue;
		try {
			await this.app.vault.adapter.remove(this.logPath);
			this.writesSinceTrim = 0;
			this.info("Logs cleared");
		} catch (error) {
			this.error("Failed to clear log file", error);
		}
	}
}