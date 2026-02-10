import { App } from "obsidian";
import { VaultSyncState, GitHubFile, FileChange } from "./types";
import { Logger } from "./logger";

export class SyncStateManager {
	private state: VaultSyncState;
	private dataFile = "sync-state.json";
	private app: App;
	private pluginId: string;
	private logger: Logger;

	constructor(app: App, pluginId: string, logger: Logger) {
		this.app = app;
		this.pluginId = pluginId;
		this.logger = logger;
		this.state = this.getEmptyState();
		this.logger.debug("SyncStateManager initialized");
	}

	private getEmptyState(): VaultSyncState {
		return {
			lastSyncTimestamp: 0,
			lastCommitSHA: "",
			files: {}
		};
	}

	async loadState(): Promise<VaultSyncState> {
		try {
			this.logger.debug("Loading sync state from file");
			const data = await this.app.vault.adapter.read(
				`.obsidian/plugins/${this.pluginId}/${this.dataFile}`
			);
			this.state = JSON.parse(data);
			this.logger.info("Sync state loaded", { fileCount: Object.keys(this.state.files).length });
		} catch {
			// File doesn't exist or is invalid, use empty state
			this.logger.info("No existing sync state found, using empty state");
			this.state = this.getEmptyState();
		}
		return this.state;
	}

	async saveState(state: VaultSyncState): Promise<void> {
		try {
			this.logger.debug("Saving sync state");
			this.state = state;
			const data = JSON.stringify(state, null, 2);
			
			// Ensure directory exists
			const pluginDir = `.obsidian/plugins/${this.pluginId}`;
			try {
				await this.app.vault.adapter.mkdir(pluginDir);
			} catch {
				// Directory might already exist, ignore error
			}
			
			await this.app.vault.adapter.write(
				`${pluginDir}/${this.dataFile}`,
				data
			);
			this.logger.info("Sync state saved", { fileCount: Object.keys(state.files).length });
		} catch (error) {
			this.logger.error("Failed to save sync state", error);
			throw error;
		}
	}

	getChangedFiles(remoteFiles: GitHubFile[]): FileChange[] {
		this.logger.debug("Comparing local and remote files", {
			remoteCount: remoteFiles.length,
			localCount: Object.keys(this.state.files).length
		});
		
		const changes: FileChange[] = [];
		const remoteFileMap = new Map(remoteFiles.map(f => [f.path, f]));
		const localFileMap = new Map(Object.entries(this.state.files));

		// Check for added and modified files
		for (const [path, remoteFile] of remoteFileMap) {
			const localFile = localFileMap.get(path);
			
			if (!localFile) {
				// New file
				changes.push({
					path,
					sha: remoteFile.sha,
					changeType: "added"
				});
			} else if (localFile.sha !== remoteFile.sha) {
				// Modified file
				changes.push({
					path,
					sha: remoteFile.sha,
					changeType: "modified"
				});
			}
		}

		// Check for deleted files (files in local sync state but not in remote)
		// Only files that were previously synced from GitHub will be deleted
		for (const [path, localFile] of localFileMap) {
			if (!remoteFileMap.has(path)) {
				changes.push({
					path,
					sha: localFile.sha,
					changeType: "deleted"
				});
			}
		}

		this.logger.info("File comparison complete", {
			added: changes.filter(c => c.changeType === "added").length,
			modified: changes.filter(c => c.changeType === "modified").length,
			deleted: changes.filter(c => c.changeType === "deleted").length,
			total: changes.length
		});

		return changes;
	}

	updateFileState(path: string, sha: string): void {
		this.state.files[path] = {
			path,
			sha,
			lastModified: Date.now()
		};
	}

	removeFileState(path: string): void {
		delete this.state.files[path];
	}

	getCurrentState(): VaultSyncState {
		return this.state;
	}
}