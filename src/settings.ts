import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import GitHubSyncPlugin from "../main";

export class GitHubSyncSettingTab extends PluginSettingTab {
	plugin: GitHubSyncPlugin;

	constructor(app: App, plugin: GitHubSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "GitHub Sync Settings" });

		// Repository URL
		new Setting(containerEl)
			.setName("Repository")
			.setDesc("GitHub repository in owner/repo format (e.g., username/my-vault)")
			.addText(text => text
				.setPlaceholder("username/my-vault")
				.setValue(this.plugin.settings.repositoryUrl)
				.onChange(async (value) => {
					this.plugin.settings.repositoryUrl = value.trim();
					await this.plugin.saveSettings();
				}));

		// Branch
		new Setting(containerEl)
			.setName("Branch")
			.setDesc("Branch to sync from (usually 'main' or 'master')")
			.addText(text => text
				.setPlaceholder("main")
				.setValue(this.plugin.settings.branch)
				.onChange(async (value) => {
					this.plugin.settings.branch = value.trim() || "main";
					await this.plugin.saveSettings();
				}));

		// Personal Access Token
		new Setting(containerEl)
			.setName("Personal Access Token")
			.setDesc("GitHub PAT with repo permissions (create at github.com/settings/tokens)")
			.addText(text => {
				text
					.setPlaceholder("ghp_xxxxxxxxxxxx")
					.setValue(this.plugin.settings.personalAccessToken)
					.onChange(async (value) => {
						this.plugin.settings.personalAccessToken = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		// Auto-sync toggle
		new Setting(containerEl)
			.setName("Auto-sync on launch")
			.setDesc("Automatically sync when Obsidian starts")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSyncOnLaunch)
				.onChange(async (value) => {
					this.plugin.settings.autoSyncOnLaunch = value;
					await this.plugin.saveSettings();
				}));

		// Last sync display
		if (this.plugin.settings.lastSyncTime > 0) {
			const lastSync = new Date(this.plugin.settings.lastSyncTime);
			containerEl.createEl("p", {
				text: `Last sync: ${lastSync.toLocaleString()}`,
				cls: "setting-item-description"
			});
		}

		// Test connection button
		new Setting(containerEl)
			.setName("Test Connection")
			.setDesc("Verify GitHub credentials and check rate limit")
			.addButton(button => button
				.setButtonText("Test Connection")
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Testing...");
					
					try {
						const success = await this.plugin.syncEngine.testConnection();
						
						if (success) {
							new Notice("✓ Connection successful!");
							
							// Show rate limit info
							const rateLimit = await this.plugin.syncEngine.getRateLimit();
							new Notice(
								`Rate limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`,
								5000
							);
						} else {
							new Notice("✗ Connection failed. Check your settings.");
						}
					} catch (error) {
						new Notice(`✗ Error: ${error.message}`);
					}
					
					button.setDisabled(false);
					button.setButtonText("Test Connection");
				}));

		// Manual sync button
		new Setting(containerEl)
			.setName("Manual Sync")
			.setDesc("Sync now from GitHub to your vault")
			.addButton(button => button
				.setButtonText("Sync Now")
				.setCta()
				.onClick(async () => {
					button.setDisabled(true);
					button.setButtonText("Syncing...");
					
					try {
						await this.plugin.syncEngine.performSync(true);
						this.display(); // Refresh to show updated last sync time
					} catch (error) {
						new Notice(`✗ Sync error: ${error.message}`);
					}
					
					button.setDisabled(false);
					button.setButtonText("Sync Now");
				}));

		// Help section
		// Debug section
		containerEl.createEl("h3", { text: "Debug", cls: "setting-item-heading" });
		
		// View logs button
		new Setting(containerEl)
			.setName("View Debug Logs")
			.setDesc("View detailed logs for troubleshooting")
			.addButton((button) => button
				.setButtonText("View Logs")
				.onClick(async () => {
					try {
						const logs = await this.plugin.logger.getLogFile();
						// Create a modal or new file with logs
						const logFile = "GitHub-Sync-Debug-Logs.md";
						const existingFile = this.app.vault.getAbstractFileByPath(logFile);
						
						const content = `# GitHub Sync Debug Logs\n\nGenerated: ${new Date().toISOString()}\n\n\`\`\`\n${logs}\n\`\`\``;
						
						if (existingFile) {
							await this.app.vault.modify(existingFile as any, content);
						} else {
							await this.app.vault.create(logFile, content);
						}
						
						new Notice("Debug logs saved to: " + logFile);
					} catch (error) {
						new Notice("Failed to get logs: " + error.message);
					}
				}));
		
		// Clear logs button
		new Setting(containerEl)
			.setName("Clear Debug Logs")
			.setDesc("Clear all debug logs")
			.addButton((button) => button
				.setButtonText("Clear Logs")
				.setWarning()
				.onClick(async () => {
					try {
						await this.plugin.logger.clearLogs();
						new Notice("Debug logs cleared");
					} catch (error) {
						new Notice("Failed to clear logs: " + error.message);
					}
				}));

		containerEl.createEl("h3", { text: "Setup Guide", cls: "setting-item-heading" });
		const helpDiv = containerEl.createDiv({ cls: "setting-item-description" });
		helpDiv.innerHTML = `
			<p><strong>To create a GitHub Personal Access Token:</strong></p>
			<ol>
				<li>Go to <a href="https://github.com/settings/tokens/new" target="_blank">GitHub Settings → Tokens</a></li>
				<li>Click "Generate new token (classic)"</li>
				<li>Give it a name (e.g., "Obsidian Sync")</li>
				<li>Select scope: <code>repo</code> (for private repos) or <code>public_repo</code></li>
				<li>Generate and copy the token</li>
				<li>Paste it above</li>
			</ol>
			<p><strong>Note:</strong> This plugin syncs <em>one-way</em> from GitHub to your vault.
			Changes made locally will be overwritten on the next sync.</p>
			<p><strong>Troubleshooting:</strong> If the plugin fails to load, click "View Logs" above to see detailed error information.</p>
		`;
	}
}