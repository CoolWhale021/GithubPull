import { App } from "obsidian";

export class Logger {
	private app: App;
	private pluginId: string;
	private logFile = "debug.log";
	private logs: string[] = [];
	private maxLogs = 1000;

	constructor(app: App, pluginId: string) {
		this.app = app;
		this.pluginId = pluginId;
	}

	private formatMessage(level: string, message: string, data?: any): string {
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

	private async writeLog(message: string) {
		// Add to memory buffer
		this.logs.push(message);
		if (this.logs.length > this.maxLogs) {
			this.logs.shift(); // Remove oldest log
		}

		// Also log to console
		console.log(message);

		// Try to write to file (may fail during plugin load)
		try {
			const pluginDir = `.obsidian/plugins/${this.pluginId}`;
			
			// Ensure directory exists
			try {
				await this.app.vault.adapter.mkdir(pluginDir);
			} catch (error) {
				// Directory might already exist
			}

			const logPath = `${pluginDir}/${this.logFile}`;
			
			// Read existing logs
			let existingLogs = "";
			try {
				existingLogs = await this.app.vault.adapter.read(logPath);
			} catch (error) {
				// File might not exist yet
			}

			// Append new log
			const updatedLogs = existingLogs + message + "\n";
			
			// Keep only last 5000 lines
			const lines = updatedLogs.split("\n");
			const trimmedLogs = lines.slice(-5000).join("\n");
			
			await this.app.vault.adapter.write(logPath, trimmedLogs);
		} catch (error) {
			// Can't write to file, just keep in memory
			console.error("Failed to write log file:", error);
		}
	}

	info(message: string, data?: any) {
		const formatted = this.formatMessage("INFO", message, data);
		this.writeLog(formatted);
	}

	warn(message: string, data?: any) {
		const formatted = this.formatMessage("WARN", message, data);
		this.writeLog(formatted);
		console.warn(formatted);
	}

	error(message: string, error?: any) {
		let errorData: any = error;
		
		if (error instanceof Error) {
			errorData = {
				message: error.message,
				stack: error.stack,
				name: error.name
			};
		}
		
		const formatted = this.formatMessage("ERROR", message, errorData);
		this.writeLog(formatted);
		console.error(formatted);
	}

	debug(message: string, data?: any) {
		const formatted = this.formatMessage("DEBUG", message, data);
		this.writeLog(formatted);
	}

	async getLogs(): Promise<string> {
		return this.logs.join("\n");
	}

	async getLogFile(): Promise<string> {
		try {
			const logPath = `.obsidian/plugins/${this.pluginId}/${this.logFile}`;
			return await this.app.vault.adapter.read(logPath);
		} catch (error) {
			return "No log file found";
		}
	}

	async clearLogs() {
		this.logs = [];
		try {
			const logPath = `.obsidian/plugins/${this.pluginId}/${this.logFile}`;
			await this.app.vault.adapter.remove(logPath);
			this.info("Logs cleared");
		} catch (error) {
			this.error("Failed to clear log file", error);
		}
	}
}