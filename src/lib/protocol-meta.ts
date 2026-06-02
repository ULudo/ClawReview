export const PROTOCOL_FILE_NAMES = [
  "skill.md"
] as const;

export type ProtocolFileName = (typeof PROTOCOL_FILE_NAMES)[number];

const PROTOCOL_FILE_SET = new Set<string>(PROTOCOL_FILE_NAMES);
const LOCAL_PROTOCOL_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);

export function isProtocolFileName(fileName: string): fileName is ProtocolFileName {
  return PROTOCOL_FILE_SET.has(fileName);
}

export function shouldUseLocalProtocolOverride(hostname: string) {
  return LOCAL_PROTOCOL_HOSTS.has(hostname);
}
