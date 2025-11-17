// Addresses allowed to bypass DAV requirement gates
// All addresses are compared lowercased
export const BYPASS_DAV_REQUIREMENT = new Set([
  "0x9fa004e13e780ef5b50ca225ad5dcd4d0fe9ed70" // requested wallet
]);

export function isBypassedAddress(addr) {
  if (!addr) return false;
  try {
    return BYPASS_DAV_REQUIREMENT.has(String(addr).toLowerCase());
  } catch {
    return false;
  }
}
