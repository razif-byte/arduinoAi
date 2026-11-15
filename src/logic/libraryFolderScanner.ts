import type { MountedLibraryFolder } from '../types/studio';

export async function parseBrowserLibraryFolder(
  fileList: FileList
): Promise<Omit<MountedLibraryFolder, 'id' | 'addedAt'> | null> {
  const files = Array.from(fileList);
  if (files.length === 0) return null;

  const firstRelPath = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || files[0].name;
  const folderName = firstRelPath.includes('/') ? firstRelPath.split('/')[0] : 'LocalLibrary';

  const headers: string[] = [];
  let libraryName = folderName;

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.h') || lower.endsWith('.hpp')) {
      headers.push(file.name);
    } else if (lower === 'library.properties') {
      try {
        const text = await file.text();
        const match = text.match(/^name\s*=\s*(.+)$/m);
        if (match?.[1]?.trim()) {
          libraryName = match[1].trim();
        }
      } catch {
        // Fallback to folderName
      }
    }
  }

  return {
    name: libraryName,
    folderName,
    fileCount: files.length,
    headers: Array.from(new Set(headers)).slice(0, 12),
  };
}
