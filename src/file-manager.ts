import { App, TFile, normalizePath } from "obsidian";

export class FileManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async createOrUpdateFile(path: string, content: ArrayBuffer): Promise<void> {
		const normalizedPath = normalizePath(path);
		
		// Ensure parent directories exist
		await this.ensureDirectoryExists(normalizedPath);

		// Determine if file is binary based on extension
		const isBinary = this.isBinaryFile(normalizedPath);
		
		if (isBinary) {
			// Handle binary files (images, PDFs, etc.)
			await this.app.vault.adapter.writeBinary(normalizedPath, content);
		} else {
			// Handle text files (markdown, JSON, etc.)
			const textContent = new TextDecoder().decode(content);
			const existingFile = this.app.vault.getAbstractFileByPath(normalizedPath);

			if (existingFile instanceof TFile) {
				// Update existing file
				await this.app.vault.modify(existingFile, textContent);
			} else {
				// Create new file
				await this.app.vault.create(normalizedPath, textContent);
			}
		}
	}

	// Default to binary for anything not on this list — UTF-8 decode/re-encode
	// of unknown formats (fonts, .heic, .psd, .epub, etc.) corrupts the bytes.
	private static readonly TEXT_EXTENSIONS = new Set([
		'.md', '.markdown', '.txt', '.text',
		'.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.htm',
		'.css', '.scss', '.less',
		'.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx',
		'.py', '.rb', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
		'.csv', '.tsv',
		'.canvas', '.excalidraw',
		'.org', '.rst', '.tex',
		'.log', '.ini', '.conf', '.cfg', '.env',
		'.gitignore', '.gitattributes', '.editorconfig', '.npmrc'
	]);

	private isBinaryFile(path: string): boolean {
		const lowerPath = path.toLowerCase();
		const lastSlash = Math.max(lowerPath.lastIndexOf('/'), lowerPath.lastIndexOf('\\'));
		const lastDot = lowerPath.lastIndexOf('.');

		// No extension — default to binary (preserves bytes; safe for unknown files)
		if (lastDot <= lastSlash) {
			return true;
		}

		const ext = lowerPath.substring(lastDot);
		return !FileManager.TEXT_EXTENSIONS.has(ext);
	}

	private async ensureDirectoryExists(filePath: string): Promise<void> {
		const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));
		if (dirPath && !(await this.app.vault.adapter.exists(dirPath))) {
			await this.app.vault.adapter.mkdir(dirPath);
		}
	}

	async fileExists(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		return await this.app.vault.adapter.exists(normalizedPath);
	}

	async deleteFile(path: string): Promise<boolean> {
		const normalizedPath = normalizePath(path);
		
		// Check if file exists before attempting deletion
		if (!(await this.app.vault.adapter.exists(normalizedPath))) {
			return false;
		}

		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (file instanceof TFile) {
			// Use FileManager.trashFile to respect user's file deletion preference
			await this.app.fileManager.trashFile(file);
			return true;
		} else {
			// Fallback for files not in vault index
			await this.app.vault.adapter.remove(normalizedPath);
			return true;
		}
	}
}