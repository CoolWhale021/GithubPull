import { App, Notice } from "obsidian";
import { GitHubAPI } from "./github-api";
import { SyncStateManager } from "./sync-state";
import { FileManager } from "./file-manager";
import { GitHubSyncSettings, SyncResult, FileChange } from "./types";
import { Logger } from "./logger";

export class SyncEngine {
	private app: App;
	private settings: GitHubSyncSettings;
	private githubAPI: GitHubAPI;
	private stateManager: SyncStateManager;
	private fileManager: FileManager;
	private isSyncing: boolean = false;
	private logger: Logger;

	constructor(
		app: App,
		settings: GitHubSyncSettings,
		stateManager: SyncStateManager,
		logger: Logger
	) {
		this.app = app;
		this.settings = settings;
		this.stateManager = stateManager;
		this.fileManager = new FileManager(app);
		this.logger = logger;
		this.logger.debug("SyncEngine initialized");
		this.initializeAPI();
	}

	private initializeAPI(): void {
		try {
			// Don't initialize if settings are empty (first run)
			if (!this.settings.repositoryUrl || !this.settings.personalAccessToken) {
				this.logger.info("Skipping GitHub API initialization - settings not configured yet");
				return;
			}
			
			this.logger.debug("Initializing GitHub API", {
				repo: this.settings.repositoryUrl,
				branch: this.settings.branch,
				hasToken: !!this.settings.personalAccessToken
			});
			
			this.githubAPI = new GitHubAPI(
				this.settings.repositoryUrl,
				this.settings.personalAccessToken,
				this.settings.branch,
				this.logger
			);
			
			this.logger.info("GitHub API initialized");
		} catch (error) {
			this.logger.error("Failed to initialize GitHub API", error);
			// Don't throw - allow plugin to load even if API init fails
			this.logger.warn("Plugin will continue without GitHub API - configure settings to enable sync");
		}
	}

	updateSettings(settings: GitHubSyncSettings): void {
		this.settings = settings;
		this.initializeAPI();
	}

	async performSync(showProgress = true): Promise<SyncResult> {
		this.logger.info("=== Sync Started ===", { showProgress });
		
		// Check if configured
		if (!this.githubAPI) {
			const error = "Plugin not configured. Please set repository URL and Personal Access Token in settings.";
			this.logger.error(error);
			new Notice(error, 10000);
			return {
				success: false,
				filesAdded: 0,
				filesModified: 0,
				filesDeleted: 0,
				errors: [{ path: "", message: error, type: "unknown" }]
			};
		}
		
		if (this.isSyncing) {
			this.logger.warn("Sync already in progress");
			new Notice("Sync already in progress");
			return {
				success: false,
				filesAdded: 0,
				filesModified: 0,
				filesDeleted: 0,
				errors: [{ path: "", message: "Sync already in progress", type: "unknown" }]
			};
		}

		this.isSyncing = true;
		const startTime = Date.now();
		const result: SyncResult = {
			success: true,
			filesAdded: 0,
			filesModified: 0,
			filesDeleted: 0,
			errors: []
		};

		try {
			if (showProgress) {
				new Notice("Starting sync from GitHub...");
			}

			// Step 1: Fetch remote repository tree
			this.logger.info("Step 1: Fetching repository tree from GitHub");
			const remoteFiles = await this.githubAPI.getRepositoryTree();
			this.logger.info(`Fetched ${remoteFiles.length} files from GitHub`);
			
			// Step 2: Load local sync state
			this.logger.info("Step 2: Loading local sync state");
			await this.stateManager.loadState();

			// Step 3: Determine what changed
			this.logger.info("Step 3: Comparing files to find changes");
			const changes = this.stateManager.getChangedFiles(remoteFiles);

			if (changes.length === 0) {
				this.logger.info("No changes detected - vault is up to date");
				if (showProgress) {
					new Notice("✓ Vault is up to date");
				}
				return result;
			}

			this.logger.info(`Found ${changes.length} file(s) to sync`);
			if (showProgress) {
				new Notice(`Syncing ${changes.length} file${changes.length > 1 ? 's' : ''}...`);
			}

			// Step 4: Download and apply changes
			this.logger.info("Step 4: Downloading and applying changes");
			await this.applyChanges(changes, result, showProgress);

			// Step 5: Save updated sync state
			this.logger.info("Step 5: Saving sync state");
			const currentState = this.stateManager.getCurrentState();
			currentState.lastSyncTimestamp = Date.now();
			await this.stateManager.saveState(currentState);

			// Update settings with last sync time
			this.settings.lastSyncTime = Date.now();

			const duration = Date.now() - startTime;
			this.logger.info("=== Sync Complete ===", {
				duration: `${duration}ms`,
				filesAdded: result.filesAdded,
				filesModified: result.filesModified,
				errors: result.errors.length
			});

			if (showProgress) {
				const message = `✓ Sync complete! ` +
					`Added: ${result.filesAdded}, Modified: ${result.filesModified}, Deleted: ${result.filesDeleted}`;
				new Notice(message, 5000);
			}

		} catch (error) {
			this.logger.error("Sync failed with error", error);
			result.success = false;
			result.errors.push({
				path: "",
				message: error.message,
				type: "unknown"
			});
			
			if (showProgress) {
				new Notice(`✗ Sync failed: ${error.message}`, 10000);
			}
			console.error("Sync error:", error);
		} finally {
			this.isSyncing = false;
			this.logger.info("Sync process ended");
		}

		return result;
	}

	private async applyChanges(
		changes: FileChange[],
		result: SyncResult,
		showProgress: boolean
	): Promise<void> {
		const BATCH_SIZE = 10;
		let processed = 0;

		for (let i = 0; i < changes.length; i += BATCH_SIZE) {
			const batch = changes.slice(i, i + BATCH_SIZE);
			
			await Promise.all(
				batch.map(change => this.applyFileChange(change, result))
			);

			processed += batch.length;
			
			if (showProgress && changes.length > 20) {
				new Notice(`Progress: ${processed}/${changes.length} files`, 2000);
			}
		}
	}

	private async applyFileChange(
		change: FileChange,
		result: SyncResult
	): Promise<void> {
		try {
			this.logger.debug(`Processing file: ${change.path}`, { changeType: change.changeType });
			
			if (change.changeType === "deleted") {
				// Handle file deletion
				const deleted = await this.fileManager.deleteFile(change.path);
				if (deleted) {
					this.logger.debug(`File deleted from vault: ${change.path}`);
					// Remove from sync state
					this.stateManager.removeFileState(change.path);
					result.filesDeleted++;
					this.logger.info(`Successfully deleted: ${change.path}`);
				} else {
					this.logger.debug(`File already absent from vault: ${change.path}`);
					// Still remove from sync state even if file doesn't exist locally
					this.stateManager.removeFileState(change.path);
				}
				return;
			}
			
			// Download file content - pass SHA for large file support
			const content = await this.githubAPI.getFileContent(change.path, change.sha);
			this.logger.debug(`Downloaded ${change.path}, size: ${content.byteLength} bytes`);
			
			// Create or update file in vault
			await this.fileManager.createOrUpdateFile(change.path, content);
			this.logger.debug(`File written to vault: ${change.path}`);
			
			// Update sync state
			this.stateManager.updateFileState(change.path, change.sha);

			// Update counters
			if (change.changeType === "added") {
				result.filesAdded++;
			} else if (change.changeType === "modified") {
				result.filesModified++;
			}

			this.logger.info(`Successfully synced: ${change.path}`);

		} catch (error) {
			this.logger.error(`Failed to sync file: ${change.path}`, error);
			result.errors.push({
				path: change.path,
				message: error.message,
				type: "file"
			});
			console.error(`Failed to sync file ${change.path}:`, error);
		}
	}

	async testConnection(): Promise<boolean> {
		try {
			if (!this.githubAPI) {
				this.logger.error("Cannot test connection - GitHub API not initialized");
				return false;
			}
			
			this.logger.info("Testing GitHub connection");
			const result = await this.githubAPI.testConnection();
			this.logger.info("Connection test result", { success: result });
			return result;
		} catch (error) {
			this.logger.error("Connection test failed", error);
			console.error("Connection test failed:", error);
			return false;
		}
	}

	async getRateLimit(): Promise<{ limit: number; remaining: number; reset: number }> {
		try {
			if (!this.githubAPI) {
				return { limit: 0, remaining: 0, reset: 0 };
			}
			return await this.githubAPI.getRateLimitStatus();
		} catch (error) {
			return { limit: 0, remaining: 0, reset: 0 };
		}
	}
}