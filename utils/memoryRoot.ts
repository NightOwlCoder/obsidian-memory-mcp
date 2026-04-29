import path from 'path';

/**
 * Get the root directory for memory entities
 * 
 * Priority:
 * 1. MEMORY_DIR env var (explicit override)
 * 2. VAULT_PERSONAL/memory (default - user's personal memory)
 * 3. VAULT_WORK/memory (fallback)
 * 
 * @returns Absolute path to memory root directory
 * @throws Error if no memory root can be determined
 */
export function getMemoryRoot(): string {
  // Priority 1: Explicit override
  const memoryDir = process.env.MEMORY_DIR;
  if (memoryDir) {
    return path.resolve(memoryDir);
  }
  
  // Priority 2: Personal vault (default)
  const vaultPersonal = process.env.VAULT_PERSONAL;
  if (vaultPersonal) {
    return path.join(path.resolve(vaultPersonal), 'memory');
  }
  
  // Priority 3: Work vault (fallback)
  const vaultWork = process.env.VAULT_WORK;
  if (vaultWork) {
    return path.join(path.resolve(vaultWork), 'memory');
  }
  
  throw new Error('No memory root configured: set MEMORY_DIR, VAULT_PERSONAL, or VAULT_WORK');
}

/**
 * Check if a path is inside a vault directory
 * 
 * @param filePath Path to check
 * @returns True if path is under VAULT_WORK or VAULT_PERSONAL
 */
export function isInsideVault(filePath: string): boolean {
  const resolvedPath = path.resolve(filePath);
  
  const vaultPersonal = process.env.VAULT_PERSONAL;
  const vaultWork = process.env.VAULT_WORK;
  
  if (vaultPersonal && resolvedPath.startsWith(path.resolve(vaultPersonal))) {
    return true;
  }
  if (vaultWork && resolvedPath.startsWith(path.resolve(vaultWork))) {
    return true;
  }
  return false;
}

/**
 * Check if memory root is inside a vault
 * 
 * @returns True if MEMORY_ROOT is under a vault
 */
export function isMemoryInsideVault(): boolean {
  const memoryRoot = getMemoryRoot();
  return isInsideVault(memoryRoot);
}
