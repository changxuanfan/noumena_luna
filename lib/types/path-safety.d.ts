export declare class PathSafetyError extends Error {
    readonly code: 'PATH_OUTSIDE_SKILL_ROOT' | 'UNSAFE_RELATIVE_PATH' | 'SYMLINK_OUTSIDE_SKILL_ROOT';
    constructor(code: PathSafetyError['code'], message: string);
}
/**
 * Resolve a single operation path and prove it remains below the supplied root.
 * The returned value is absolute, while the caller remains responsible for
 * checking the real path when the target already exists.
 */
export declare function resolveContainedPath(root: string, child: string): string;
/**
 * Normalize an archive entry without allowing absolute paths or parent
 * traversal. Backslashes are treated as separators on every platform because
 * archives can be produced on a different operating system.
 */
export declare function assertSafeRelativePath(entry: string): string;
export declare function assertSafeSkillDirectoryName(name: string): string;
export declare function assertExistingPathContained(root: string, target: string): Promise<void>;
export declare function assertNotSymbolicLink(target: string): Promise<void>;
