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

	private isBinaryFile(path: string): boolean {
		const binaryExtensions = [
			// Images
			'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
			// Documents
			'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
			// Archives
			'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2',
			// Audio/Video
			'.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac', '.ogg',
			// Executables and libraries
			'.exe', '.dll', '.so', '.dylib',
			// Other binary formats
			'.bin', '.dat', '.db', '.sqlite'
		];
		
		const lowerPath = path.toLowerCase();
		return binaryExtensions.some(ext => lowerPath.endsWith(ext));
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
			// Use vault.delete for tracked files
			await this.app.vault.delete(file);
			return true;
		} else {
			// Fallback for files not in vault index
			await this.app.vault.adapter.remove(normalizedPath);
			return true;
		}
	}
}