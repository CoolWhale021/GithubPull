import { App, normalizePath } from "obsidian";
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

	async getChangedFiles(
		remoteFiles: GitHubFile[],
		options: { skipDeletions?: boolean } = {}
	): Promise<FileChange[]> {
		this.logger.debug("Comparing local and remote files", {
			remoteCount: remoteFiles.length,
			localCount: Object.keys(this.state.files).length,
			skipDeletions: !!options.skipDeletions
		});

		const changes: FileChange[] = [];
		const remoteFileMap = new Map(remoteFiles.map(f => [f.path, f]));
		const localFileMap = new Map(Object.entries(this.state.files));

		// Files whose SHA matches local state — defer existence checks for batched parallel lookup
		const unchangedCandidates: GitHubFile[] = [];

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
			} else {
				unchangedCandidates.push(remoteFile);
			}
		}

		// Detect locally-deleted-but-tracked files in parallel; re-pull any that are missing on disk
		const existenceResults = await Promise.all(
			unchangedCandidates.map(f => this.app.vault.adapter.exists(normalizePath(f.path)))
		);
		for (let i = 0; i < unchangedCandidates.length; i++) {
			if (!existenceResults[i]) {
				const f = unchangedCandidates[i];
				changes.push({
					path: f.path,
					sha: f.sha,
					changeType: "added"
				});
			}
		}

		// Check for deleted files (files in local sync state but not in remote)
		// Only files that were previously synced from GitHub will be deleted.
		// Skip this when the remote tree is truncated — missing entries are
		// likely an artifact of truncation, not real deletions, and we would
		// otherwise wipe huge swaths of the vault.
		if (!options.skipDeletions) {
			for (const [path, localFile] of localFileMap) {
				if (!remoteFileMap.has(path)) {
					changes.push({
						path,
						sha: localFile.sha,
						changeType: "deleted"
					});
				}
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