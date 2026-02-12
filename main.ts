import { App, Plugin, PluginManifest, Notice } from "obsidian";
import { GitHubSyncSettings, DEFAULT_SETTINGS } from "./src/types";
import { GitHubSyncSettingTab } from "./src/settings";
import { SyncEngine } from "./src/sync-engine";
import { SyncStateManager } from "./src/sync-state";
import { Logger } from "./src/logger";

export default class GitHubSyncPlugin extends Plugin {
	settings: GitHubSyncSettings;
	syncEngine: SyncEngine;
	private stateManager: SyncStateManager;
	logger: Logger;

	constructor(app: App, manifest: PluginManifest) {
		super(app, manifest);
		
		// Initialize logger immediately
		try {
			this.logger = new Logger(app, manifest.id);
			this.logger.info("=== GitHub Pull Plugin Constructor Called ===");
			this.logger.info("Plugin ID: " + manifest.id);
			this.logger.info("Plugin Version: " + manifest.version);
		} catch (error) {
			console.error("Failed to initialize logger:", error);
		}
	}

	async onload() {
		try {
			this.logger.info("=== Starting Plugin Load ===");
			this.logger.debug("Loading GitHub Pull plugin");

			// Load settings
			this.logger.info("Loading settings...");
			await this.loadSettings();
			this.logger.info("Settings loaded", {
				hasRepo: !!this.settings.repositoryUrl,
				hasPAT: !!this.settings.personalAccessToken,
				branch: this.settings.branch,
				autoSync: this.settings.autoSyncOnLaunch
			});

			// Initialize sync state manager
			this.logger.info("Initializing sync state manager...");
			this.stateManager = new SyncStateManager(this.app, this.manifest.id, this.logger);
			this.logger.info("Sync state manager initialized");

			// Initialize sync engine
			this.logger.info("Initializing sync engine...");
			this.syncEngine = new SyncEngine(
				this.app,
				this.settings,
				this.stateManager,
				this.logger
			);
			this.logger.info("Sync engine initialized");

			// Add ribbon icon for manual sync
			this.logger.info("Adding ribbon icon...");
			this.addRibbonIcon("refresh-cw", "Sync from GitHub", async () => {
				this.logger.info("Ribbon icon clicked - starting manual sync");
				await this.syncEngine.performSync(true);
			});
			this.logger.info("Ribbon icon added");

			// Add settings tab
			this.logger.info("Adding settings tab...");
			this.addSettingTab(new GitHubSyncSettingTab(this.app, this));
			this.logger.info("Settings tab added");

			// Add command for manual sync
			this.logger.info("Adding command...");
			this.addCommand({
				id: "sync-from-github",
				name: "Sync from GitHub",
				callback: async () => {
					this.logger.info("Command executed - starting manual sync");
					await this.syncEngine.performSync(true);
				}
			});
			this.logger.info("Command added");

			// Auto-sync on launch if enabled and configured
			const isConfigured = this.isConfigured();
			this.logger.info("Configuration check", {
				isConfigured,
				autoSyncEnabled: this.settings.autoSyncOnLaunch
			});

			if (this.settings.autoSyncOnLaunch && isConfigured) {
				this.logger.info("Auto-sync enabled - scheduling sync in 2 seconds");
				// Delay slightly to let Obsidian fully load
				setTimeout(() => {
					this.logger.info("Auto-sync timer triggered");
					new Notice("Auto-syncing from GitHub...");
					void this.syncEngine.performSync(true);
				}, 2000);
			} else if (!isConfigured) {
				this.logger.info("Plugin not configured - showing setup notice");
				new Notice("Please configure repository and token in settings", 8000);
			}

			this.logger.info("=== Plugin Load Complete ===");
		} catch (error) {
			this.logger.error("Fatal error during plugin load", error);
			console.error("GitHub Pull plugin load failed:", error);
			
			// Show user-friendly error message
			const errorMsg = error.message || String(error);
			new Notice(`GitHub Pull: ${errorMsg}. Check Settings → GitHub Pull for configuration.`, 10000);
			
			// Don't throw - allow plugin to load so user can configure it
			this.logger.warn("Plugin loaded with errors - user can configure in settings");
		}
	}

	onunload() {
		this.logger.info("=== Plugin Unload ===");
		this.logger.debug("Unloading GitHub Pull plugin");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update sync engine with new settings
		this.syncEngine?.updateSettings(this.settings);
	}

	private isConfigured(): boolean {
		return !!(
			this.settings.repositoryUrl &&
			this.settings.personalAccessToken &&
			this.settings.branch
		);
	}
}