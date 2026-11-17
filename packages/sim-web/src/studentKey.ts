// Standalone-demo student identity. When this sim is embedded in CAP, CAP supplies the
// studentKey instead — see docs/architecture-proposal.md §4. For now, a per-browser anonymous
// id persisted in localStorage is enough to demo leave-and-resume.
const STORAGE_KEY = 'sap-sim-student-key';

export function getStudentKey(): string {
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}
